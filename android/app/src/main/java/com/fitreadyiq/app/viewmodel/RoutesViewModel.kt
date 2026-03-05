package com.fitreadyiq.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fitreadyiq.app.data.api.models.Route
import com.fitreadyiq.app.data.repository.FitReadyRepository
import com.fitreadyiq.app.data.repository.Result
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RoutesUiState(
    val isLoading: Boolean = false,
    val routes: List<Route> = emptyList(),
    val filteredRoutes: List<Route> = emptyList(),
    val selectedDifficulty: String = "all",
    val error: String? = null
)

class RoutesViewModel(
    private val repository: FitReadyRepository = FitReadyRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(RoutesUiState(isLoading = true))
    val uiState: StateFlow<RoutesUiState> = _uiState.asStateFlow()

    init {
        loadRoutes()
    }

    fun loadRoutes() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            when (val result = repository.getRoutes()) {
                is Result.Success -> {
                    val routes = result.data
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        routes = routes,
                        filteredRoutes = applyFilter(routes, _uiState.value.selectedDifficulty)
                    )
                }
                is Result.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = result.message
                    )
                }
                is Result.Loading -> Unit
            }
        }
    }

    fun setDifficultyFilter(difficulty: String) {
        val filtered = applyFilter(_uiState.value.routes, difficulty)
        _uiState.value = _uiState.value.copy(
            selectedDifficulty = difficulty,
            filteredRoutes = filtered
        )
    }

    private fun applyFilter(routes: List<Route>, difficulty: String): List<Route> {
        return if (difficulty == "all") routes
        else routes.filter { it.difficulty.lowercase() == difficulty.lowercase() }
    }
}
