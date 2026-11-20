package app.pulse.sound

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The gym's short sound effects (docs/gym.md "Sound and touch"), on Android's SoundPool: it is made for clips under a
 * second, decodes them once, plays them with no start-up delay, and asks for no audio focus, so music the person is
 * training to keeps playing under them. One pool exists only while a workout page is open (`load`, then `release`), so
 * nothing is held in memory the rest of the time. A phone set to silent or vibrate plays nothing.
 */
class PulseSoundModule : Module() {
  private var pool: SoundPool? = null
  private val ids = HashMap<String, Int>()

  override fun definition() = ModuleDefinition {
    Name("PulseSound")

    Function("load") { load() }

    Function("play") { name: String, volume: Double -> play(name, volume.toFloat()) }

    Function("release") { release() }

    OnDestroy { release() }
  }

  private fun load() {
    if (pool != null) return
    val ctx = appContext.reactContext ?: return
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_GAME)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val next = SoundPool.Builder().setMaxStreams(3).setAudioAttributes(attributes).build()
    pool = next
    for ((name, res) in SOUNDS) ids[name] = next.load(ctx, res, 1)
  }

  private fun play(name: String, volume: Float) {
    val p = pool ?: return
    val id = ids[name] ?: return
    val ctx = appContext.reactContext ?: return
    val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    if (audio != null && audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
    val v = volume.coerceIn(0f, 1f)
    // Returns 0 while the clip is still decoding, the first moments after load: that tap is simply silent.
    p.play(id, v, v, 1, 0, 1f)
  }

  private fun release() {
    pool?.release()
    pool = null
    ids.clear()
  }

  private companion object {
    val SOUNDS = mapOf(
      "tick" to R.raw.gym_tick,
      "untick" to R.raw.gym_untick,
      "add" to R.raw.gym_add,
      "done" to R.raw.gym_done,
      "record" to R.raw.gym_record,
      "finish" to R.raw.gym_finish,
    )
  }
}
