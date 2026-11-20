package app.pulse.backup

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Zips files for the full backup (src/actions/backup.ts), which no Expo module does. Each entry is a name in the zip
 * and a file path or file:// URI; entries whose file is missing are skipped. Runs on Expo's background queue.
 */
class PulseBackupModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PulseBackup")

    AsyncFunction("zip") { entries: List<Map<String, String>>, out: String ->
      val target = File(path(out))
      target.parentFile?.mkdirs()
      ZipOutputStream(target.outputStream().buffered()).use { zip ->
        for (entry in entries) {
          val name = entry["name"] ?: continue
          val file = File(path(entry["path"] ?: continue))
          if (!file.isFile) continue
          zip.putNextEntry(ZipEntry(name).apply { time = file.lastModified() })
          file.inputStream().buffered().use { it.copyTo(zip) }
          zip.closeEntry()
        }
      }
      target.length().toDouble()
    }
  }

  private fun path(p: String) = if (p.startsWith("file://")) android.net.Uri.parse(p).path ?: p.removePrefix("file://") else p
}
