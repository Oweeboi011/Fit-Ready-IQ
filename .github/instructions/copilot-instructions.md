# GitHub Copilot Instructions

> Place this file at `.github/copilot-instructions.md` in your repository.

## Project Overview

This is a full-stack solution following Clean Architecture, SOLID principles, and Azure Well-Architected Framework (WAF).

**Stack:**

- Backend: Python 3.12, FastAPI, Pydantic v2
- Frontend: Next.js 14+, React 18+, TypeScript, Tailwind CSS
- Database: PostgreSQL
- Infrastructure: Docker, Azure Container Apps, Bicep

---

## Architecture Rules

### Clean Architecture Layers

Follow this dependency rule - dependencies point INWARD only:

```
Infrastructure → Interface → Application → Domain
     (outer)                                (inner)
```

## Critical Design Patterns

### Resolve all IDE warnings and errors before committing.

Resolve all warnings and errors in the code before committing to ensure code quality and maintainability. This includes fixing type errors, syntax errors, and any other issues highlighted by the IDE.

### README.md and Documentations under Docs folder as Living Documentation

Always update `README.md` and documentation under the `Docs` folder based on the latest changes around the solution. Make sure this document will be used as a reference for future contributors and maintainers, so it should be kept up-to-date with any architectural or implementation changes.

### Solution Review

Review solution for according to Clean Architecture and SOLID principles and check for proper separation of concerns and dependency management
Review solution for error handling and check for proper exception management and logging
Review solution for compliance with relevant regulations and standards (e.g., GDPR, HIPAA)
Review solution for maintainability and check for modularity and reusability of code
Review solution for scalability and check for proper use of caching, load balancing, and other techniques to handle increased traffic and data volume
Review solution testing and check missing tests in all layers
Review solution for maintainability and check for code smells
Review solution for scalability and check for potential bottlenecks
Review solution for performance and check for inefficient code or algorithms
Review solution for performance and check for proper use of asynchronous programming,parallel processing, and other techniques to optimize resource usage and response times
Review solution for consistency and check for adherence to coding standards and guidelines, including formatting, naming conventions, and use of design patterns
Review solution for error handling and check for proper use of try-catch blocks, logging, and error propagation to ensure thaterrors are handled gracefully and do not cause system crashes or data loss
Review solution for security vulnerabilities and check for proper input validation, sanitization, and use of secure coding practices to prevent common vulnerabilities such as SQL injection, cross-site scripting, and buffer overflows
Review solution for compliance with relevant regulations

**Layer locations and responsibilities:**

| Layer          | Path                  | Contains                                                     |
| -------------- | --------------------- | ------------------------------------------------------------ |
| Domain         | `src/domain/`         | Entities, value objects, domain services, interfaces (ports) |
| Application    | `src/application/`    | Use cases, DTOs, application services                        |
| Interface      | `src/interface/`      | API routers, repository implementations, presenters          |
| Infrastructure | `src/infrastructure/` | Config, database, external clients, middleware               |

**Import rules:**

- Domain layer: NO imports from other layers
- Application layer: Import ONLY from domain
- Interface layer: Import from domain and application
- Infrastructure layer: Can import from all layers

---

## Code Conventions

### Python/FastAPI

**File naming:**

- Use snake_case for files and directories
- Use PascalCase for classes
- Use snake_case for functions and variables

**Imports order:**

1. Standard library
2. Third-party packages
3. Local imports (absolute)

**Type hints:**

- Always use type hints for function parameters and return types
- Use `|` for unions (Python 3.10+): `str | None`
- Use generics where appropriate: `list[str]`, `dict[str, Any]`

**Async:**

- Prefer `async def` for I/O operations
- Use `await` for all async calls
- Never use `asyncio.run()` inside async functions

**Example patterns:**

```python
# Entity (domain layer)
from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4

@dataclass
class Entity:
    id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)
```

```python
# Repository interface (domain layer)
from abc import ABC, abstractmethod
from typing import Generic, TypeVar

T = TypeVar("T")

class IRepository(ABC, Generic[T]):
    @abstractmethod
    async def get_by_id(self, id: UUID) -> T | None: ...

    @abstractmethod
    async def add(self, entity: T) -> T: ...
```

```python
# Use case (application layer)
@dataclass
class CreateUserCommand:
    email: str
    name: str

class CreateUserUseCase:
    def __init__(self, repository: IUserRepository):
        self._repository = repository

    async def execute(self, command: CreateUserCommand) -> User:
        user = User(email=command.email, name=command.name)
        return await self._repository.add(user)
```

```python
# Router (interface layer)
from fastapi import APIRouter, Depends, HTTPException, status

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: CreateUserRequest,
    use_case: CreateUserUseCase = Depends(get_create_user_use_case)
) -> UserResponse:
    command = CreateUserCommand(email=request.email, name=request.name)
    user = await use_case.execute(command)
    return UserResponse.from_entity(user)
```

```python
# Settings (infrastructure layer)
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    app_name: str = "app"
    environment: str = "local"
    debug: bool = False
    database_url: str | None = None

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### TypeScript/React

**File naming:**

- Use PascalCase for components: `UserCard.tsx`
- Use camelCase for utilities: `apiClient.ts`
- Use kebab-case for routes/pages in Next.js App Router

**Component patterns:**

- Prefer function components with hooks
- Use TypeScript interfaces for props
- Destructure props in function signature

**Example patterns:**

```typescript
// Component with props interface
interface UserCardProps {
  user: User;
  onSelect?: (user: User) => void;
}

export function UserCard({ user, onSelect }: UserCardProps) {
  return (
    <div onClick={() => onSelect?.(user)}>
      <h3>{user.name}</h3>
    </div>
  );
}
```

```typescript
// Custom hook
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { users, isLoading, error, fetchUsers };
}
```

```typescript
// API client
const api = {
  async getUsers(): Promise<User[]> {
    const response = await fetch(`${config.apiUrl}/users`);
    if (!response.ok) throw new Error("Failed to fetch users");
    return response.json();
  },
};
```

---

## SOLID Principles

Apply these principles when generating code:

**Single Responsibility:**

- One class/function = one purpose
- Split large functions into smaller, focused ones

**Open/Closed:**

- Use base classes/interfaces for extension
- Avoid modifying existing code; extend instead

**Liskov Substitution:**

- Subtypes must be substitutable for base types
- Don't override methods with incompatible signatures

**Interface Segregation:**

- Prefer small, specific interfaces
- Don't force implementations to depend on unused methods

**Dependency Inversion:**

- Depend on abstractions (interfaces), not concretions
- Inject dependencies via constructor

---

## Error Handling

**Python:**

```python
# Custom exceptions in domain layer
class DomainException(Exception):
    """Base domain exception."""
    pass

class EntityNotFoundError(DomainException):
    """Raised when entity not found."""
    def __init__(self, entity_type: str, entity_id: UUID):
        super().__init__(f"{entity_type} with id {entity_id} not found")

# Exception handler in interface layer
@app.exception_handler(EntityNotFoundError)
async def entity_not_found_handler(request: Request, exc: EntityNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})
```

**TypeScript:**

```typescript
// Error boundary pattern
class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchWithError<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }
  return response.json();
}
```

---

## Testing Patterns

**Python (pytest):**

```python
# Unit test with mock
import pytest
from unittest.mock import AsyncMock

@pytest.fixture
def mock_repository():
    return AsyncMock(spec=IUserRepository)

@pytest.mark.asyncio
async def test_create_user(mock_repository):
    use_case = CreateUserUseCase(mock_repository)
    command = CreateUserCommand(email="test@test.com", name="Test")

    mock_repository.add.return_value = User(email="test@test.com", name="Test")

    result = await use_case.execute(command)

    assert result.email == "test@test.com"
    mock_repository.add.assert_called_once()
```

**TypeScript (Jest):**

```typescript
// Component test
import { render, screen, fireEvent } from '@testing-library/react';

describe('UserCard', () => {
  it('calls onSelect when clicked', () => {
    const mockOnSelect = jest.fn();
    const user = { id: '1', name: 'Test User' };

    render(<UserCard user={user} onSelect={mockOnSelect} />);
    fireEvent.click(screen.getByText('Test User'));

    expect(mockOnSelect).toHaveBeenCalledWith(user);
  });
});
```

---

## API Design

**RESTful conventions:**

- `GET /resources` - List resources
- `GET /resources/{id}` - Get single resource
- `POST /resources` - Create resource
- `PUT /resources/{id}` - Full update
- `PATCH /resources/{id}` - Partial update
- `DELETE /resources/{id}` - Delete resource

**Response patterns:**

```python
# Pydantic schemas for requests/responses
class CreateUserRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=100)

class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    created_at: datetime

    @classmethod
    def from_entity(cls, entity: User) -> "UserResponse":
        return cls(
            id=entity.id,
            email=entity.email,
            name=entity.name,
            created_at=entity.created_at
        )
```

**Error responses:**

```python
class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
```

---

## Configuration

**Never hardcode:**

- API keys, secrets, passwords
- URLs and endpoints
- Feature flags
- Environment-specific values

**Use environment variables:**

```python
# Always use Settings class
settings = get_settings()
client = OpenAIClient(api_key=settings.azure_openai_api_key)
```

```typescript
// Use config object
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

---

## Docker

**Multi-stage builds:**

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app

FROM base AS builder
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS production
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY src/ ./src/
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0"]
```

---

## Documentation

**Docstrings (Python):**

```python
def process_message(message: str, user_id: UUID) -> ProcessResult:
    """Process an incoming message.

    Args:
        message: The message content to process.
        user_id: The ID of the user sending the message.

    Returns:
        ProcessResult containing the response and metadata.

    Raises:
        ValidationError: If message is empty or too long.
        UserNotFoundError: If user_id doesn't exist.
    """
```

**JSDoc (TypeScript):**

```typescript
/**
 * Fetches users from the API.
 * @param filters - Optional filters to apply
 * @returns Promise resolving to array of users
 * @throws {ApiError} If the request fails
 */
async function getUsers(filters?: UserFilters): Promise<User[]> {
```

---

## Security

**Input validation:**

- Always validate and sanitize user input
- Use Pydantic models for request validation
- Use parameterized queries for database operations

**Authentication:**

- Use dependency injection for auth
- Validate tokens in middleware
- Never log sensitive data

```python
# Auth dependency
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    user_service: UserService = Depends(get_user_service)
) -> User:
    payload = verify_token(token)
    user = await user_service.get_by_id(payload.sub)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user
```

---

## File Generation Rules

When generating new files:

1. **Determine the layer** based on the file's responsibility
2. **Place in correct directory** following Clean Architecture
3. **Use appropriate imports** respecting dependency rules
4. **Add type hints** for all functions and methods
5. **Include docstrings** for public functions and classes
6. **Follow naming conventions** for the language
7. **Add to `__init__.py`** exports if needed

**Do NOT:**

- Put business logic in routers/controllers
- Import from outer layers into inner layers
- Hardcode configuration values
- Skip error handling
- Create god classes with multiple responsibilities
- Use `Any` type without good reason
