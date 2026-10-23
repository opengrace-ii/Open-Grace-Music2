package com.example.ui

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.StorageHelper
import com.example.data.StorageInfo
import com.example.data.downloader.AudioDownloader
import com.example.data.downloader.DeviceMusicHelper
import com.example.data.local.OgmDatabase
import com.example.data.local.TrackEntity
import com.example.data.model.AudiophileFormat
import com.example.data.model.Track
import com.example.data.model.TrackSource
import com.example.player.OgmPlayer
import com.example.player.PlayerState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File

enum class LibraryTab(val title: String) {
    ALL("All Tracks"),
    LOSSLESS("Lossless (FLAC/ALAC/DSD)"),
    DOWNLOADS("Downloads"),
    DEVICE_MUSIC("Phone Music"),
    MP3("MP3 Audio")
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val db = OgmDatabase.getInstance(application)
    private val trackDao = db.trackDao()
    private val downloader = AudioDownloader(application)
    val player = OgmPlayer(application)

    val playerState: StateFlow<PlayerState> = player.playerState

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedTab = MutableStateFlow(LibraryTab.ALL)
    val selectedTab: StateFlow<LibraryTab> = _selectedTab.asStateFlow()

    private val _deviceTracks = MutableStateFlow<List<Track>>(emptyList())

    val tracks: StateFlow<List<Track>> = combine(
        trackDao.getAllTracks(),
        _deviceTracks,
        _searchQuery,
        _selectedTab
    ) { localEntities, deviceList, query, tab ->
        val localDomain = localEntities.map { it.toDomain() }
        val combined = (localDomain + deviceList).distinctBy { it.id }

        val filteredByQuery = if (query.isBlank()) {
            combined
        } else {
            combined.filter {
                it.title.contains(query, ignoreCase = true) ||
                        it.artist.contains(query, ignoreCase = true) ||
                        it.album.contains(query, ignoreCase = true)
            }
        }

        when (tab) {
            LibraryTab.ALL -> filteredByQuery
            LibraryTab.LOSSLESS -> filteredByQuery.filter {
                it.format.uppercase() in listOf("FLAC", "ALAC", "DSD", "DSF", "WAV")
            }
            LibraryTab.DOWNLOADS -> filteredByQuery.filter { it.source == TrackSource.YOUTUBE || it.source == TrackSource.DIRECT_URL }
            LibraryTab.DEVICE_MUSIC -> filteredByQuery.filter { it.source == TrackSource.DEVICE_MUSIC || it.savedToDeviceMusic }
            LibraryTab.MP3 -> filteredByQuery.filter { it.format.equals("MP3", ignoreCase = true) }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _storageInfo = MutableStateFlow(StorageInfo())
    val storageInfo: StateFlow<StorageInfo> = _storageInfo.asStateFlow()

    private val _isDownloading = MutableStateFlow(false)
    val isDownloading: StateFlow<Boolean> = _isDownloading.asStateFlow()

    private val _downloadProgress = MutableStateFlow(0f)
    val downloadProgress: StateFlow<Float> = _downloadProgress.asStateFlow()

    private val _downloadStatus = MutableStateFlow("")
    val downloadStatus: StateFlow<String> = _downloadStatus.asStateFlow()

    private val _showDownloadDialog = MutableStateFlow(false)
    val showDownloadDialog: StateFlow<Boolean> = _showDownloadDialog.asStateFlow()

    private val _showYouTubeBrowser = MutableStateFlow(false)
    val showYouTubeBrowser: StateFlow<Boolean> = _showYouTubeBrowser.asStateFlow()

    private val _showFullPlayer = MutableStateFlow(false)
    val showFullPlayer: StateFlow<Boolean> = _showFullPlayer.asStateFlow()

    private val _prefilledUrl = MutableStateFlow<String?>(null)
    val prefilledUrl: StateFlow<String?> = _prefilledUrl.asStateFlow()

    private val _userMessage = MutableStateFlow<String?>(null)
    val userMessage: StateFlow<String?> = _userMessage.asStateFlow()

    private val _selectedTrackForLyrics = MutableStateFlow<Track?>(null)
    val selectedTrackForLyrics: StateFlow<Track?> = _selectedTrackForLyrics.asStateFlow()

    fun openLyrics(track: Track) { _selectedTrackForLyrics.value = track }
    fun closeLyrics() { _selectedTrackForLyrics.value = null }

    init {
        refreshStorage()
    }

    fun handleSharedUrl(url: String) {
        _prefilledUrl.value = url
        _showDownloadDialog.value = true
    }

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
    }

    fun onTabSelect(tab: LibraryTab) {
        _selectedTab.value = tab
    }

    fun openDownloadDialog(initialUrl: String? = null) {
        _prefilledUrl.value = initialUrl
        _showDownloadDialog.value = true
    }
    fun closeDownloadDialog() {
        _prefilledUrl.value = null
        _showDownloadDialog.value = false
    }

    fun openYouTubeBrowser(initialUrl: String? = null) {
        _prefilledUrl.value = initialUrl
        _showYouTubeBrowser.value = true
    }
    fun closeYouTubeBrowser() {
        _showYouTubeBrowser.value = false
    }

    fun openFullPlayer() { _showFullPlayer.value = true }
    fun closeFullPlayer() { _showFullPlayer.value = false }

    fun clearUserMessage() { _userMessage.value = null }

    fun refreshStorage() {
        viewModelScope.launch {
            val count = tracks.value.size
            _storageInfo.value = StorageHelper.calculateStorage(getApplication(), count)
        }
    }

    fun startDownload(
        url: String,
        saveToMusicFolder: Boolean = true,
        targetFormat: AudiophileFormat = AudiophileFormat.FLAC_24,
        bitrateKbps: Int = targetFormat.bitrateKbps,
        capturedStreamUrl: String? = null,
        streamHeaders: Map<String, String>? = null
    ) {
        if (url.isBlank()) {
            _userMessage.value = "Please enter a valid YouTube or audio link."
            return
        }

        viewModelScope.launch {
            _isDownloading.value = true
            _downloadProgress.value = 0.05f
            _downloadStatus.value = "Resolving ${targetFormat.code} audio & metadata..."

            try {
                val mediaInfo = downloader.resolveMediaInfo(url)
                val track = downloader.downloadAudio(
                    mediaInfo = mediaInfo,
                    saveToPublicMusic = saveToMusicFolder,
                    targetFormat = targetFormat,
                    bitrateKbps = bitrateKbps,
                    capturedStreamUrl = capturedStreamUrl,
                    streamHeaders = streamHeaders
                ) { progress, status ->
                    _downloadProgress.value = progress
                    _downloadStatus.value = status
                }

                trackDao.insertTrack(TrackEntity.fromDomain(track))
                _userMessage.value = "✓ Saved \"${track.title}\" (${track.audiophileBadge})"
                _prefilledUrl.value = null
                _showDownloadDialog.value = false
                _showYouTubeBrowser.value = false
                refreshStorage()

                player.playTrack(track, tracks.value + track)
            } catch (e: Exception) {
                _userMessage.value = "Conversion error: ${e.message ?: "Failed to process audio"}"
            } finally {
                _isDownloading.value = false
                _downloadProgress.value = 0f
                _downloadStatus.value = ""
            }
        }
    }

    fun importLocalAudio(uri: Uri, displayName: String?) {
        viewModelScope.launch {
            try {
                val track = downloader.importLocalAudio(uri, displayName)
                trackDao.insertTrack(TrackEntity.fromDomain(track))
                _userMessage.value = "✓ Imported \"${track.title}\" (${track.format})"
                refreshStorage()
            } catch (e: Exception) {
                _userMessage.value = "Import failed: ${e.message}"
            }
        }
    }

    fun scanDeviceMusic() {
        viewModelScope.launch {
            _downloadStatus.value = "Scanning phone Music folder..."
            val found = DeviceMusicHelper.scanDeviceMusic(getApplication())
            _deviceTracks.value = found
            _userMessage.value = "Found ${found.size} songs on device"
            refreshStorage()
        }
    }

    fun saveTrackToDeviceMusic(track: Track) {
        viewModelScope.launch {
            val file = File(track.filePath)
            if (!file.exists()) {
                _userMessage.value = "Local file not found on disk."
                return@launch
            }
            val mimeType = DeviceMusicHelper.resolveMimeType(track.format)
            val uri = DeviceMusicHelper.saveToSystemMusicFolder(
                context = getApplication(),
                sourceFile = file,
                title = track.title,
                artist = track.artist,
                album = track.album,
                mimeType = mimeType
            )
            if (uri != null) {
                trackDao.markSavedToMusicFolder(track.id)
                _userMessage.value = "✓ Saved ${track.format} to phone Music folder!"
                refreshStorage()
            } else {
                _userMessage.value = "Could not export to phone Music folder."
            }
        }
    }

    fun deleteTrack(track: Track) {
        viewModelScope.launch {
            if (track.filePath.isNotEmpty()) {
                runCatching { File(track.filePath).delete() }
            }
            trackDao.deleteById(track.id)
            _deviceTracks.value = _deviceTracks.value.filter { it.id != track.id }
            if (playerState.value.currentTrack?.id == track.id) {
                player.togglePlayPause()
            }
            _userMessage.value = "Removed \"${track.title}\""
            refreshStorage()
        }
    }

    fun toggleFavorite(track: Track) {
        viewModelScope.launch {
            trackDao.setFavorite(track.id, !track.isFavorite)
        }
    }

    fun playTrack(track: Track) {
        player.playTrack(track, tracks.value)
    }

    override fun onCleared() {
        super.onCleared()
        player.release()
    }
}
