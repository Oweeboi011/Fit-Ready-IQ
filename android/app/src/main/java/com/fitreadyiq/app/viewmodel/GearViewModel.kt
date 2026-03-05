package com.fitreadyiq.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fitreadyiq.app.data.api.models.GearResponse
import com.fitreadyiq.app.data.repository.FitReadyRepository
import com.fitreadyiq.app.data.repository.Result
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class GearUiState(
    val isLoading: Boolean = false,
    val gear: GearResponse? = null,
    val selectedDifficulty: String = "moderate",
    val error: String? = null
)

class GearViewModel(
    private val repository: FitReadyRepository = FitReadyRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow(GearUiState(isLoading = true))
    val uiState: StateFlow<GearUiState> = _uiState.asStateFlow()

    init {
        loadGear("moderate")
    }

    fun loadGear(difficulty: String = "moderate") {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isLoading = true,
                error = null,
                selectedDifficulty = difficulty
            )

            when (val result = repository.getGear(difficulty)) {
                is Result.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        gear = result.data
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

    fun changeDifficulty(difficulty: String) {
        loadGear(difficulty)
    }
}
