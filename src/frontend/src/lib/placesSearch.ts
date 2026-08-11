// Low-level Google Places Service wrappers, shared by the mountain/route/
// campsite fetchers in placesFetchers.ts. Each wraps exactly one Places API
// call in a Promise — the pagination and dedup logic that varies per
// collection stays in the caller.

export function textSearchOnce(
  service: google.maps.places.PlacesService,
  query: string,
  location: google.maps.LatLngLiteral,
  radius: number
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve) => {
    service.textSearch({ query, location, radius }, (results, status) => {
      resolve(status === google.maps.places.PlacesServiceStatus.OK && results ? results : []);
    });
  });
}

/** Walks up to as many pages as Google offers, 300ms apart, calling `onPage` for each. */
export function textSearchPaged(
  service: google.maps.places.PlacesService,
  query: string,
  location: google.maps.LatLngLiteral,
  radius: number,
  onPage: (results: google.maps.places.PlaceResult[]) => void
): Promise<void> {
  return new Promise((resolve) => {
    const handlePage = (
      results: google.maps.places.PlaceResult[] | null,
      status: google.maps.places.PlacesServiceStatus,
      pagination: google.maps.places.PlaceSearchPagination | null
    ) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        onPage(results);
        if (pagination?.hasNextPage) {
          setTimeout(() => pagination.nextPage(), 300);
          return;
        }
      }
      resolve();
    };
    service.textSearch({ query, location, radius }, handlePage);
  });
}

export function nearbySearchOnce(
  service: google.maps.places.PlacesService,
  params: google.maps.places.PlaceSearchRequest
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve) => {
    service.nearbySearch(params, (results, status) => {
      resolve(status === google.maps.places.PlacesServiceStatus.OK && results ? results : []);
    });
  });
}

/** Collects PlaceResults by `place_id`, dropping repeats across multiple searches. */
export function dedupedPlacesCollector() {
  const all: google.maps.places.PlaceResult[] = [];
  const seen = new Set<string>();
  const push = (results: google.maps.places.PlaceResult[]) => {
    for (const r of results) {
      const id = r.place_id;
      if (id && !seen.has(id)) {
        seen.add(id);
        all.push(r);
      }
    }
  };
  return { all, push };
}

export function newPlacesService(): google.maps.places.PlacesService {
  return new google.maps.places.PlacesService(document.createElement('div'));
}
