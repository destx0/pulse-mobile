package app.pulse.sms

import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reading the SMS inbox, which no Expo module does. The caller asks for READ_SMS first; without it the query throws and
 * this returns an empty list. Only the fields a food order needs cross the bridge.
 */
class PulseSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PulseSms")

    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      readInbox(sinceMs.toLong(), limit)
    }
  }

  private fun readInbox(sinceMs: Long, limit: Int): List<Map<String, Any>> {
    val ctx = appContext.reactContext ?: return emptyList()
    val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
    val cursor = try {
      ctx.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        "date >= ?",
        arrayOf(sinceMs.toString()),
        "date DESC LIMIT ${limit.coerceIn(1, 5000)}",
      )
    } catch (e: SecurityException) {
      return emptyList()
    } ?: return emptyList()

    val messages = ArrayList<Map<String, Any>>()
    cursor.use {
      while (it.moveToNext()) {
        val message = mutableMapOf<String, Any>()
        message["id"] = it.getLong(0).toString()
        message["address"] = it.getString(1) ?: ""
        message["body"] = it.getString(2) ?: ""
        message["date"] = it.getLong(3).toDouble()
        messages.add(message)
      }
    }
    return messages
  }
}
