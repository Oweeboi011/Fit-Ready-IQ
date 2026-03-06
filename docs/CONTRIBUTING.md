# Contributing to Fit-Ready-IQ

Thank you for your interest in contributing! This document provides guidelines and workflows for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow project standards

## Development Workflow

### 1. Fork and Clone
```bash
# Fork repository on GitHub
git clone https://github.com/YOUR_USERNAME/Fit-Ready-IQ.git
cd Fit-Ready-IQ
git remote add upstream https://github.com/Oweeboi011/Fit-Ready-IQ.git
```

### 2. Create Feature Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 3. Setup Development Environment
```bash
# Backend setup
cd backend
poetry install
poetry shell

# Frontend setup
cd frontend
npm install

# Start services
docker-compose up -d
```

### 4. Make Changes
- Write clean, documented code
- Follow coding standards (see below)
- Add tests for new features
- Update documentation

### 5. Run Tests
```bash
# Backend tests
cd backend
poetry run pytest -v --cov=src
poetry run black src tests
poetry run isort src tests
poetry run mypy src

# Frontend tests
cd frontend
npm test
npm run type-check
npm run lint
```

### 6. Commit Changes
```bash
git add .
git commit -m "feat: add route difficulty calculator"
```

#### Commit Message Convention
```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting
- `refactor`: Code restructuring
- `test`: Test additions/changes
- `chore`: Build/tooling changes

Examples:
```
feat(fitness): add VO2max calculation algorithm
fix(auth): resolve token refresh issue
docs(api): update endpoint documentation
```

### 7. Push and Create Pull Request
```bash
git push origin feature/your-feature-name
```

Then create PR on GitHub with:
- Clear title and description
- Link to related issues
- Screenshots (if UI changes)
- Test results

## Coding Standards

### Python (Backend)

#### Style Guide
- Follow PEP 8
- Use Black formatter (line length 100)
- Use isort for import sorting
- Use type hints for all functions

#### Example
```python
from typing import Optional
from uuid import UUID

from ..domain.entities import User


async def get_user_fitness_score(
    user_id: UUID,
    activity_repo: IActivityRepository
) -> float:
    """
    Calculate user's current fitness score.
    
    Args:
        user_id: User's unique identifier
        activity_repo: Activity repository instance
        
    Returns:
        Fitness score (0-100)
        
    Raises:
        UserNotFoundError: If user doesn't exist
    """
    activities = await activity_repo.get_by_user(user_id, limit=50)
    
    if not activities:
        return 0.0
    
    calculator = FitnessScoreCalculator()
    score = calculator.calculate_fitness_score(activities)
    
    return score.total_score
```

#### Docstrings
Use Google-style docstrings:
```python
def calculate_distance(coord1: Coordinates, coord2: Coordinates) -> float:
    """
    Calculate distance between two coordinates using Haversine formula.
    
    Args:
        coord1: Starting coordinates
        coord2: Ending coordinates
        
    Returns:
        Distance in meters
        
    Example:
        >>> start = Coordinates(latitude=40.7128, longitude=-74.0060)
        >>> end = Coordinates(latitude=34.0522, longitude=-118.2437)
        >>> distance = calculate_distance(start, end)
        >>> print(f"{distance:.2f} meters")
    """
```

### TypeScript/React (Frontend)

#### Style Guide
- Use Prettier for formatting
- Use ESLint for linting
- Prefer functional components with hooks
- Use TypeScript for type safety

#### Example
```typescript
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FitnessScore } from '@/types';

interface FitnessScoreDisplayProps {
  userId: string;
}

export function FitnessScoreDisplay({ userId }: FitnessScoreDisplayProps) {
  const { data: score, isLoading, error } = useQuery({
    queryKey: ['fitness-score', userId],
    queryFn: () => api.fitness.getScore(userId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!score) return null;

  return (
    <div className="rounded-lg border p-6">
      <h2 className="text-2xl font-bold">Fitness Score</h2>
      <p className="text-4xl font-bold text-primary">{score.totalScore}</p>
      <p className="text-muted-foreground">Grade: {score.grade}</p>
    </div>
  );
}
```

#### Component Structure
```
Component.tsx
├─ Imports (React, libraries, types, components, styles)
├─ Types/Interfaces
├─ Component function
│  ├─ Hooks
│  ├─ State
│  ├─ Effects
│  ├─ Handlers
│  ├─ Computed values
│  └─ Return JSX
└─ Export
```

## Testing Guidelines

### Backend Tests

#### Unit Tests
```python
# tests/unit/domain/test_fitness_score_calculator.py
import pytest
from datetime import datetime, timedelta
from src.domain.entities import Activity
from src.domain.services import FitnessScoreCalculator


class TestFitnessScoreCalculator:
    def test_calculates_score_from_activities(self):
        # Arrange
        calculator = FitnessScoreCalculator()
        activities = [
            Activity(
                activity_type="run",
                distance=5000,
                duration=1800,
                start_date=datetime.utcnow() - timedelta(days=1)
            ),
            # ... more activities
        ]
        
        # Act
        score = calculator.calculate_fitness_score(activities)
        
        # Assert
        assert 0 <= score.total_score <= 100
        assert score.experience_level in ["beginner", "intermediate", "advanced", "expert"]
```

#### Integration Tests
```python
# tests/integration/test_activity_repository.py
import pytest
from src.infrastructure.database import AsyncSessionLocal
from src.infrastructure.repositories import ActivityRepository


@pytest.mark.asyncio
async def test_save_and_retrieve_activity():
    async with AsyncSessionLocal() as session:
        repo = ActivityRepository(session)
        
        # Create activity
        activity = Activity(
            user_id=test_user_id,
            activity_type="hike",
            distance=10000
        )
        
        # Save
        saved = await repo.save(activity)
        assert saved.id is not None
        
        # Retrieve
        retrieved = await repo.get_by_id(saved.id)
        assert retrieved is not None
        assert retrieved.distance == 10000
```

### Frontend Tests

#### Component Tests
```typescript
// components/__tests__/FitnessScoreDisplay.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FitnessScoreDisplay } from '../FitnessScoreDisplay';

describe('FitnessScoreDisplay', () => {
  it('renders loading state initially', () => {
    const queryClient = new QueryClient();
    
    render(
      <QueryClientProvider client={queryClient}>
        <FitnessScoreDisplay userId="test-id" />
      </QueryClientProvider>
    );
    
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
  
  it('displays fitness score when loaded', async () => {
    // Mock API response
    // ... test implementation
  });
});
```

## Project Structure

### Adding New Features

#### Backend Feature
1. **Domain Layer**: Create entities/value objects if needed
2. **Application Layer**: Implement use case
3. **Infrastructure Layer**: Add repositories/clients if needed
4. **Presentation Layer**: Create API endpoint
5. **Tests**: Add unit and integration tests
6. **Documentation**: Update API.md

#### Frontend Feature
1. **Types**: Define TypeScript interfaces
2. **API Client**: Add API methods
3. **Components**: Create UI components
4. **Pages**: Add routes if needed
5. **Tests**: Add component tests
6. **Documentation**: Update README

### File Organization
```
# Backend
src/domain/entities/new_entity.py
src/application/use_cases/new_feature/new_use_case.py
src/infrastructure/repositories/new_repository.py
src/presentation/routes/new_routes.py
tests/unit/domain/test_new_entity.py

# Frontend
src/types/new-feature.ts
src/lib/api/new-feature.ts
src/components/new-feature/NewComponent.tsx
src/app/new-feature/page.tsx
```

## Documentation

### Code Documentation
- All public functions must have docstrings/JSDoc
- Complex algorithms need explanatory comments
- Include examples for non-obvious usage

### API Documentation
- Update `docs/API.md` for new endpoints
- Include request/response examples
- Document error codes

### Architecture Documentation
- Update `docs/ARCHITECTURE.md` for structural changes
- Document new design patterns
- Update diagrams if needed

## Review Process

### Before Submitting PR
- [ ] All tests pass
- [ ] Code is formatted
- [ ] Types are correct
- [ ] Documentation updated
- [ ] No console.log or debugging code
- [ ] Commit messages follow convention

### PR Review Checklist
Reviewers will check:
- Code quality and readability
- Test coverage
- Performance implications
- Security concerns
- Documentation completeness
- Adherence to architecture principles

### Addressing Feedback
- Respond to all comments
- Make requested changes
- Re-request review when ready

## Common Tasks

### Adding External API Integration
1. Create interface in `domain/interfaces/`
2. Implement client in `infrastructure/api_clients/`
3. Add configuration in `config/settings.py`
4. Add tests with mocked responses
5. Update `.env.example`

### Adding Database Table
1. Create SQLAlchemy model in `infrastructure/database/models.py`
2. Create Alembic migration: `alembic revision --autogenerate -m "description"`
3. Review migration file
4. Test migration: `alembic upgrade head`
5. Create repository interface and implementation

### Adding API Endpoint
1. Define Pydantic schemas in `presentation/schemas/`
2. Create route handler in `presentation/routes/`
3. Add to main app in `main.py`
4. Write tests
5. Update OpenAPI docs

## Getting Help

- **Questions**: Open a Discussion on GitHub
- **Bugs**: Open an Issue with reproduction steps
- **Features**: Open an Issue with use case description
- **Chat**: Join project Discord (link in README)

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing to Fit-Ready-IQ!
