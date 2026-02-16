package com.echocatering.pos.cache

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

class VideoCacheManager(private val context: Context) {
    
    private val cacheDir: File = File(context.cacheDir, "video_cache").apply { mkdirs() }
    private val client = OkHttpClient()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    companion object {
        private const val TAG = "VideoCacheManager"
        private const val MAX_CACHE_SIZE = 200 * 1024 * 1024L // 200MB
    }
    
    fun getCachedVideoPath(url: String): String? {
        val cacheFile = getCacheFile(url)
        return if (cacheFile.exists() && cacheFile.length() > 0) {
            Log.d(TAG, "Video cache hit: $url")
            cacheFile.absolutePath
        } else {
            null
        }
    }
    
    fun getCachedVideoUri(url: String): String? {
        val path = getCachedVideoPath(url)
        return path?.let { "file://$it" }
    }
    
    fun isVideoCached(url: String): Boolean {
        return getCacheFile(url).exists()
    }
    
    fun cacheVideo(url: String, onComplete: ((Boolean) -> Unit)? = null) {
        scope.launch {
            try {
                val cacheFile = getCacheFile(url)
                
                if (cacheFile.exists() && cacheFile.length() > 0) {
                    Log.d(TAG, "Video already cached: $url")
                    onComplete?.invoke(true)
                    return@launch
                }
                
                // Check cache size and clean if needed
                cleanCacheIfNeeded()
                
                Log.d(TAG, "Downloading video: $url")
                val request = Request.Builder().url(url).build()
                val response = client.newCall(request).execute()
                
                if (response.isSuccessful) {
                    response.body?.let { body ->
                        FileOutputStream(cacheFile).use { output ->
                            body.byteStream().copyTo(output)
                        }
                        Log.d(TAG, "Video cached successfully: $url (${cacheFile.length()} bytes)")
                        onComplete?.invoke(true)
                    }
                } else {
                    Log.e(TAG, "Failed to download video: ${response.code}")
                    onComplete?.invoke(false)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error caching video: $url", e)
                onComplete?.invoke(false)
            }
        }
    }
    
    fun cacheVideos(urls: List<String>, onProgress: ((Int, Int) -> Unit)? = null) {
        scope.launch {
            urls.forEachIndexed { index, url ->
                cacheVideo(url)
                onProgress?.invoke(index + 1, urls.size)
            }
        }
    }
    
    private fun getCacheFile(url: String): File {
        val hash = md5(url)
        val extension = url.substringAfterLast(".", "mp4")
        return File(cacheDir, "$hash.$extension")
    }
    
    private fun md5(input: String): String {
        val md = MessageDigest.getInstance("MD5")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
    
    private fun cleanCacheIfNeeded() {
        val files = cacheDir.listFiles() ?: return
        var totalSize = files.sumOf { it.length() }
        
        if (totalSize > MAX_CACHE_SIZE) {
            Log.d(TAG, "Cache size exceeded, cleaning old files")
            // Sort by last modified, delete oldest first
            files.sortedBy { it.lastModified() }.forEach { file ->
                if (totalSize > MAX_CACHE_SIZE * 0.8) {
                    totalSize -= file.length()
                    file.delete()
                    Log.d(TAG, "Deleted cached video: ${file.name}")
                }
            }
        }
    }
    
    fun clearCache() {
        cacheDir.listFiles()?.forEach { it.delete() }
        Log.d(TAG, "Video cache cleared")
    }
    
    fun getCacheSize(): Long {
        return cacheDir.listFiles()?.sumOf { it.length() } ?: 0
    }
}
