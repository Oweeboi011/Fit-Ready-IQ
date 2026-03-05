package com.fitreadyiq.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fitreadyiq.app.data.api.models.FitnessSummary
import com.fitreadyiq.app.data.api.models.ScoreResponse
import com.fitreadyiq.app.data.repository.FitReadyRepository
import com.fitreadyiq.app.data.repository.Result
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val isLoading: Boolean = false,
    val fitnessSummary: FitnessSummary? = null,
    val score: ScoreResponse? = null,
    val isBackendOnline: Boolean = false,
    val error: String? = null
)

class DashboardViewModel(
    private val repository: FitReadyRepository = FitReadyRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState(isLoading = true))
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val isOnline = repository.checkHealth()

            val summaryResult = repository.getFitnessSummary()
            val scoreResult = repository.getScore()

            val summary = when (summaryResult) {
                is Result.Success -> summaryResult.data
                is Result.Error -> null
                is Result.Loading -> null
            }

            val score = when (scoreResult) {
                is Result.Success -> scoreResult.data
                is Result.Error -> null
                is Result.Loading -> null
            }

            val error = if (summary == null && score == null) "Failed to load data" else null

            _uiState.value = DashboardUiState(
                isLoading = false,
                fitnessSummary = summary,
                score = score,
                isBackendOnline = isOnline,
                error = error
            )
        }
    }

    fun refresh() {
        loadDashboard()
    }
}
