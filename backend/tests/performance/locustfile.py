"""Locust performance and load test scenarios for core API endpoints."""

from locust import HttpUser, between, task


class ApiUser(HttpUser):
    """Baseline API load profile for health and root endpoints."""

    wait_time = between(0.5, 1.5)

    @task(3)
    def health(self) -> None:
        with self.client.get(
            "/health", name="GET /health", catch_response=True
        ) as response:
            if response.status_code != 200:
                response.failure(f"unexpected status: {response.status_code}")

    @task(1)
    def root(self) -> None:
        with self.client.get("/", name="GET /", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"unexpected status: {response.status_code}")
