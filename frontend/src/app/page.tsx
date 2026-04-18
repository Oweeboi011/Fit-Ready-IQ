"use client";

// Fit Ready IQ - Main Page
import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useJsApiLoader } from "@react-google-maps/api";
import { Mountain, Tent, Route, Search, X, Watch, User, ChevronRight, MapPin, TrendingUp, ArrowUpDown } from 'lucide-react';
import RouteFilter, { FilterState } from "@/components/RouteFilter";
import ConnectDevicesModal from "@/components/ConnectDevicesModal";
import DetailsModal from "@/components/DetailsModal";

const libraries: ("places" | "geometry")[] = ["places", "geometry"];

// Dynamically import MapView to avoid SSR issues with mapbox-gl
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
        <p className="text-slate-500">Loading map...</p>
      </div>
    </div>
  ),
});

interface Route {
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  activity_type: string;
  polyline?: [number, number][];
  photos?: string[];
  jumpoff_elevation?: number;
  summit_elevation?: number;
  strava_segment?: {
    id: string;
    name: string;
    distance: number;
    avg_grade: number;
    kom_time?: string;
    qom_time?: string;
    total_efforts?: number;
  };
}

interface Mountain {
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number;
  prominence_m?: number;
  mountain_type: string;
  photos?: string[];
  jumpoff_elevation?: number;
  summit_elevation?: number;
  strava_segment?: {
    id: string;
    name: string;
    distance: number;
    avg_grade: number;
    kom_time?: string;
    qom_time?: string;
    total_efforts?: number;
  };
}

interface Campsite {
  id: string;
  name: string;
  coordinates: [number, number];
  type: string;
  rating?: number;
  amenities?: string[];
  photos?: string[];
}

export default function Home() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
  const [mountains, setMountains] = useState<Mountain[]>([]);
  const [campsites, setCampsites] = useState<Campsite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'routes' | 'mountains' | 'campsites'>('routes');
  const focusUserLocationRef = useRef<() => void>(() => {});
  const [selectedDetails, setSelectedDetails] = useState<
    | { type: 'route'; data: Route }
    | { type: 'mountain'; data: Mountain }
    | { type: 'campsite'; data: Campsite }
    | null
  >(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    address?: string;
  } | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  // Helper function to fetch place photos
  const fetchPlacePhotos = async (placeId: string): Promise<string[]> => {
    try {
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        console.warn('Google Maps API not loaded — no photos available');
        return [];
      }
      
      return new Promise((resolve) => {
        const placesService = new google.maps.places.PlacesService(
          document.createElement('div')
        );
        
        placesService.getDetails(
          {
            placeId,
            fields: ['photos'],
          },
          (place, status) => {
            console.log(`Photo fetch for ${placeId}:`, status, place?.photos?.length || 0, 'photos');
            if (status === google.maps.places.PlacesServiceStatus.OK && place?.photos && place.photos.length > 0) {
              const photoUrls = place.photos
                .slice(0, 6)
                .map(photo => photo.getUrl({ maxWidth: 800, maxHeight: 600 }));
              resolve(photoUrls);
            } else {
              resolve([]);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error in fetchPlacePhotos:', error);
      return [];
    }
  };

  // Helper function to generate mock Strava segment data
  const generateStravaSegment = (name: string, distance: number, elevation: number) => {
    const avgGrade = ((elevation / (distance * 1000)) * 100);
    const hasSegment = Math.random() > 0.1; // 90% chance of having Strava data
    
    if (!hasSegment) return undefined;
    
    // Generate realistic KOM/QOM times
    const baseSpeed = 3.5; // meters per second
    const gradeAdjustment = 1 - (avgGrade / 100) * 0.5;
    const distanceMeters = distance * 1000;
    const timeSeconds = Math.floor((distanceMeters / baseSpeed) * gradeAdjustment);
    
    const komSeconds = timeSeconds + Math.floor(Math.random() * 60);
    const qomSeconds = Math.floor(komSeconds * 1.15); // QOM typically ~15% slower
    
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return {
      id: `seg_${Math.random().toString(36).substr(2, 9)}`,
      name: `${name} Climb`,
      distance,
      avg_grade: parseFloat(avgGrade.toFixed(1)),
      kom_time: formatTime(komSeconds),
      qom_time: formatTime(qomSeconds),
      total_efforts: Math.floor(Math.random() * 5000) + 100,
    };
  };

  // Batch-fetch real elevations from Google ElevationService (max 512 locations per request)
  const fetchElevations = (locations: google.maps.LatLngLiteral[]): Promise<(number | null)[]> => {
    return new Promise((resolve) => {
      if (!locations.length) { resolve([]); return; }
      const elevationService = new google.maps.ElevationService();
      const CHUNK = 512;
      const chunks: google.maps.LatLngLiteral[][] = [];
      for (let i = 0; i < locations.length; i += CHUNK) chunks.push(locations.slice(i, i + CHUNK));
      Promise.all(
        chunks.map(chunk =>
          new Promise<(number | null)[]>(res => {
            elevationService.getElevationForLocations(
              { locations: chunk },
              (results, status) => {
                if (status === google.maps.ElevationStatus.OK && results) {
                  res(results.map(r => r.elevation != null ? Math.round(r.elevation) : null));
                } else {
                  res(chunk.map(() => null));
                }
              }
            );
          })
        )
      ).then(all => resolve(all.flat()));
    });
  };

  // Fetch real data from Google Maps Places API
  useEffect(() => {
    if (!isLoaded) return;
    if (typeof window === 'undefined' || !window.google) return;

    const fetchRoutes = async () => {
      try {
        setIsLoading(true);
        
        // Get user's location first
        const userCoords = await new Promise<[number, number]>((resolve, reject) => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (position) => {
                resolve([position.coords.longitude, position.coords.latitude]);
              },
              (error) => {
                console.error("Geolocation error:", error);
                // Fallback to San Francisco
                resolve([-122.4194, 37.7749]);
              }
            );
          } else {
            resolve([-122.4194, 37.7749]);
          }
        });

        // Get reverse geocoding for address
        let addressResult = 'Unknown Location';
        try {
          const geocoder = new google.maps.Geocoder();
          addressResult = await new Promise<string>((resolve) => {
            geocoder.geocode(
              { location: { lat: userCoords[1], lng: userCoords[0] } },
              (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                  resolve(results[0].formatted_address);
                } else {
                  resolve('Unknown Location');
                }
              }
            );
          });
        } catch (err) {
          console.error('Geocoding error:', err);
        }

        setUserLocation({
          lat: userCoords[1],
          lng: userCoords[0],
          address: addressResult,
        });

        // TODO: Replace with actual backend API calls
        // Fetch routes from backend
        // const routesResponse = await fetch(
        //   `${process.env.NEXT_PUBLIC_API_URL}/api/routes/nearby?lat=${userCoords[1]}&lon=${userCoords[0]}&radius_km=50`
        // );
        // const routesData = await routesResponse.json();
        
        // Fetch mountains using Google Maps Places API
        let mountains: Mountain[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          mountains = await new Promise(async (resolve) => {
            const allMountainPlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allMountainPlaces.find(p => p.place_id === r.place_id);

            // textSearch — no radius hard cap, surfaces mountains like
            // Mt. Talamitam, Mt. Lantik, Mt. Apayang that nearbySearch misses
            const textQueries = [
              'mountain',
              'mount',
              'Mt. mountain',
              'peak mountain',
              'summit mountain',
              'volcano mountain',
              'bundok',       // Filipino word for mountain
              'tuloy',        // Filipino for hill/peak
            ];
            await Promise.all(textQueries.map(query =>
              new Promise<void>((res) => {
                placesService.textSearch(
                  {
                    query,
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                  },
                  (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                      results.filter(dedupe).forEach(r => allMountainPlaces.push(r));
                    }
                    res();
                  }
                );
              })
            ));

            // nearbySearch as fallback for strictly typed natural_feature entries
            await new Promise<void>((res) => {
              placesService.nearbySearch(
                {
                  location: { lat: userCoords[1], lng: userCoords[0] },
                  radius: 50000,
                  type: 'natural_feature' as string,
                  keyword: 'mountain peak summit volcano',
                },
                (results, status) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    results.filter(dedupe).forEach(r => allMountainPlaces.push(r));
                  }
                  res();
                }
              );
            });

            const PEAK_KEYWORDS = ['mount', 'mt.', 'mt ', 'mountain', 'peak', 'summit', 'hill', 'ridge', 'butte', 'knob', 'crest', 'highland', 'volcano', 'volcan', 'bulkan', 'bundok'];
            const EXCLUDE_TYPES = new Set(['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'lodging', 'store', 'shopping_mall', 'hospital', 'school', 'church', 'place_of_worship', 'gas_station', 'bank']);
            const filteredMountainPlaces = allMountainPlaces
                .filter(place =>
                  place.name &&
                  place.geometry?.location &&
                  PEAK_KEYWORDS.some(kw => place.name!.toLowerCase().includes(kw)) &&
                  !(place.types || []).some(t => EXCLUDE_TYPES.has(t))
                )
                .slice(0, 60);

            // Batch-fetch real summit elevations from Google ElevationService
            const mountainLocations = filteredMountainPlaces.map(p => ({
              lat: p.geometry!.location!.lat(),
              lng: p.geometry!.location!.lng(),
            }));
            const mountainElevations = await fetchElevations(mountainLocations);

            const mountainPromises = filteredMountainPlaces
                .map(async (place, index) => {
                  const elevation = mountainElevations[index] ?? (Math.floor(Math.random() * 3000) + 500);
                  const prominence = Math.floor(elevation * (0.2 + Math.random() * 0.4));
                  // Jumpoff: trailhead is typically at 40–55% of summit elevation
                  const jumpoff = Math.floor(elevation * (0.40 + Math.random() * 0.15));

                  let photos: string[] = [];
                  if (place.place_id) {
                    try {
                      photos = await fetchPlacePhotos(place.place_id);
                    } catch {
                      photos = [];
                    }
                  }

                  const distance = Math.random() * 8 + 2;

                  return {
                    id: `m${index + 1}`,
                    name: place.name || 'Unknown Mountain',
                    coordinates: [
                      place.geometry!.location!.lng(),
                      place.geometry!.location!.lat(),
                    ] as [number, number],
                    elevation_m: elevation,
                    prominence_m: prominence,
                    mountain_type: 'peak',
                    photos,
                    jumpoff_elevation: jumpoff,
                    summit_elevation: elevation,
                    strava_segment: generateStravaSegment(place.name || 'Mountain', distance, elevation - jumpoff),
                  };
                });

            const mountainData = await Promise.all(mountainPromises);
            resolve(mountainData);
          });
        } catch (err) {
          console.error('Mountain fetch error:', err);
          mountains = [];
        }

        // Fetch routes — use textSearch (not nearbySearch) so the 50 km hard cap
        // doesn't apply and all Google Maps hiking-tagged areas are surfaced.
        let routes: Route[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          routes = await new Promise(async (resolve) => {
            const allRoutePlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allRoutePlaces.find(p => p.place_id === r.place_id);

            // textSearch queries — broad + Filipino-specific terms to surface all hiking areas
            const textQueries = [
              'hiking trail',
              'hiking area',
              'trekking trail',
              'trail park',
              'national park hiking',
              'protected area trail',
              'forest park trail',
              'eco park hiking',
              'nature trail',
              'mountain trail',
              'ridge trail',
              'forest trail',
              'wilderness trail',
              'scenic trail',
              'walking trail',
              'trail head',
              'nature park',
              'protected forest',
              'likha trail',         // Filipino
              'dayhike area',        // Filipino community term
              'jumpoff site',        // Filipino mountaineering term
              'trail Philippines',
              'DENR protected area',
              'provincial park trail',
              'heritage trail',
            ];

            // Helper: fetch one textSearch query with up to 3 pages of results
            const fetchTextSearchWithPaging = (query: string) =>
              new Promise<void>((res) => {
                const handlePage = (
                  results: google.maps.places.PlaceResult[] | null,
                  status: google.maps.places.PlacesServiceStatus,
                  pagination: google.maps.places.PlaceSearchPagination | null
                ) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    results.filter(dedupe).forEach(r => allRoutePlaces.push(r));
                    if (pagination?.hasNextPage) {
                      setTimeout(() => pagination.nextPage(), 300);
                    } else {
                      res();
                    }
                  } else {
                    res();
                  }
                };
                placesService.textSearch(
                  {
                    query,
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                  },
                  handlePage
                );
              });

            await Promise.all(textQueries.map(fetchTextSearchWithPaging));

            // Also pull nearbySearch for parks / tourist_attractions / natural_feature tagged as hiking
            const nearbyTypes: string[] = ['park', 'tourist_attraction', 'natural_feature'];
            await Promise.all(nearbyTypes.map(type =>
              new Promise<void>((res) => {
                placesService.nearbySearch(
                  {
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                    type,
                    keyword: 'hiking trail trek dayhike',
                  },
                  (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                      results.filter(dedupe).forEach(r => allRoutePlaces.push(r));
                    }
                    res();
                  }
                );
              })
            ));

            const EXCLUDE_ROUTE_TYPES = new Set(['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'lodging', 'store', 'shopping_mall', 'hospital', 'school', 'church', 'place_of_worship', 'gas_station', 'bank']);
            const EXCLUDE_ROUTE_KEYWORDS = ['farm', 'resort', 'hotel', 'casino', 'supermarket', 'mall'];

            const filteredRoutePlaces = allRoutePlaces
              .filter(place =>
                place.name &&
                place.geometry?.location &&
                !(place.types || []).some(t => EXCLUDE_ROUTE_TYPES.has(t)) &&
                !EXCLUDE_ROUTE_KEYWORDS.some(kw => place.name!.toLowerCase().includes(kw))
              )
              .slice(0, 100);

            // Batch-fetch real base (jumpoff) elevations from Google ElevationService
            const routeLocations = filteredRoutePlaces.map(p => ({
              lat: p.geometry!.location!.lat(),
              lng: p.geometry!.location!.lng(),
            }));
            const routeBaseElevations = await fetchElevations(routeLocations);

            const routePromises = filteredRoutePlaces
              .map(async (place, index) => {
                const name = place.name!.toLowerCase();
                let activityType = 'hike';
                if (name.includes('bike') || name.includes('cycling') || name.includes('bikepacking')) activityType = 'bike';
                else if (name.includes('tour') || name.includes('road') || name.includes('scenic drive') || name.includes('heritage road') || name.includes('route')) activityType = 'tour';

                let difficulty = 'moderate';
                if (place.rating && place.rating >= 4.5) difficulty = 'easy';
                else if (place.rating && place.rating < 3.5) difficulty = 'hard';

                const distance = Math.random() * 15 + 2;
                const elevationGain = Math.floor(Math.random() * 800 + 50);
                const jumpoff = routeBaseElevations[index] ?? Math.floor(Math.random() * 300 + 100);

                let photos: string[] = [];
                if (place.place_id) {
                  try {
                    photos = await fetchPlacePhotos(place.place_id);
                  } catch {
                    photos = [];
                  }
                }

                return {
                  id: `r${index + 1}`,
                  name: place.name || 'Trail',
                  coordinates: [
                    place.geometry!.location!.lng(),
                    place.geometry!.location!.lat(),
                  ] as [number, number],
                  distance_km: distance,
                  elevation_gain_m: elevationGain,
                  difficulty,
                  activity_type: activityType,
                  photos,
                  jumpoff_elevation: jumpoff,
                  summit_elevation: jumpoff + elevationGain,
                  strava_segment: generateStravaSegment(place.name || 'Trail', distance, elevationGain),
                };
              });

            const routeData = await Promise.all(routePromises);
            resolve(routeData);
          });
        } catch (err) {
          console.error('Routes fetch error:', err);
          routes = [];
        }

        // Fetch campsites
        let campsites: Campsite[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          campsites = await new Promise(async (resolve) => {
            const allCampsitePlaces: google.maps.places.PlaceResult[] = [];
            const dedupe = (r: google.maps.places.PlaceResult) =>
              !allCampsitePlaces.find(p => p.place_id === r.place_id);

            // textSearch — no radius cap, catches all Google Maps campground tags
            const textQueries = [
              'campground',
              'campsite',
              'camping area',
              'camping site',
              'camp ground',
              'eco camp',
              'glamping',
              'tent camping',
              'campsite park',
            ];
            await Promise.all(textQueries.map(query =>
              new Promise<void>((res) => {
                placesService.textSearch(
                  {
                    query,
                    location: { lat: userCoords[1], lng: userCoords[0] },
                    radius: 50000,
                  },
                  (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                      results.filter(dedupe).forEach(r => allCampsitePlaces.push(r));
                    }
                    res();
                  }
                );
              })
            ));

            // nearbySearch with campground type for anything textSearch missed
            await new Promise<void>((res) => {
              placesService.nearbySearch(
                {
                  location: { lat: userCoords[1], lng: userCoords[0] },
                  radius: 50000,
                  type: 'campground' as string,
                },
                (results, status) => {
                  if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    results.filter(dedupe).forEach(r => allCampsitePlaces.push(r));
                  }
                  res();
                }
              );
            });

            const EXCLUDE_CAMP_TYPES = new Set(['restaurant', 'food', 'bar', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'store', 'shopping_mall', 'hospital', 'school', 'church', 'place_of_worship', 'gas_station', 'bank', 'farm']);
            const EXCLUDE_CAMP_KEYWORDS = ['farm', 'resort', 'hotel', 'motel', 'inn', 'pension', 'hostel'];

            const campsitePromises = allCampsitePlaces
              .filter(place =>
                place.name &&
                place.geometry?.location &&
                !(place.types || []).some(t => EXCLUDE_CAMP_TYPES.has(t)) &&
                !EXCLUDE_CAMP_KEYWORDS.some(kw => place.name!.toLowerCase().includes(kw))
              )
              .slice(0, 60)
              .map(async (place, index) => {
                let photos: string[] = [];
                if (place.place_id) {
                  try {
                    photos = await fetchPlacePhotos(place.place_id);
                  } catch {
                    photos = [];
                  }
                }

                return {
                  id: `c${index + 1}`,
                  name: place.name || 'Campsite',
                  coordinates: [
                    place.geometry!.location!.lng(),
                    place.geometry!.location!.lat(),
                  ] as [number, number],
                  type: 'campground',
                  rating: place.rating,
                  amenities: [],
                  photos,
                };
              });

            const campsiteData = await Promise.all(campsitePromises);
            resolve(campsiteData);
          });
        } catch (err) {
          console.error('Campsite fetch error:', err);
          campsites = [];
        }

        setRoutes(routes);
        setFilteredRoutes(routes);
        setMountains(mountains);
        setCampsites(campsites);
        setIsLoading(false);
      } catch (err) {
        setError("Failed to load routes");
        setIsLoading(false);
      }
    };

    fetchRoutes();
  }, [isLoaded]);

  const handleFilterChange = (filters: FilterState) => {
    let filtered = [...routes];

    // Filter by activity type
    if (filters.activityTypes.length > 0) {
      filtered = filtered.filter((route) =>
        filters.activityTypes.includes(route.activity_type)
      );
    }

    // Filter by difficulty
    if (filters.difficulty.length > 0) {
      filtered = filtered.filter((route) =>
        filters.difficulty.includes(route.difficulty)
      );
    }

    // Filter by distance
    filtered = filtered.filter((route) => route.distance_km <= filters.maxDistance);

    // Filter by elevation
    filtered = filtered.filter(
      (route) =>
        route.elevation_gain_m >= filters.minElevation &&
        route.elevation_gain_m <= filters.maxElevation
    );

    setFilteredRoutes(filtered);
  };

  const handleRouteClick = (route: Route) => {
    setSelectedDetails({ type: 'route', data: route });
  };

  const handleMountainClick = (mountain: Mountain) => {
    setSelectedDetails({ type: 'mountain', data: mountain });
  };

  const handleCampsiteClick = (campsite: Campsite) => {
    setSelectedDetails({ type: 'campsite', data: campsite });
  };

  return (
    <main className="flex h-screen flex-col">
      {/* Header */}
      <header className="z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-5">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <Mountain className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-white">Fit Ready IQ</span>
          <span className="hidden sm:flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Beta
          </span>
        </div>

        {/* Nav actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDeviceModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
          >
            <Watch className="h-3.5 w-3.5" />
            Connect Devices
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200">
            <User className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Connect Devices Modal */}
      <ConnectDevicesModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="sidebar-scroll flex w-80 flex-shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-3 gap-2.5">
          {/* Current Location */}
          {userLocation && (
            <button
              type="button"
              onClick={() => focusUserLocationRef.current?.()}
              className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
              title="Focus map on your location"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-600">
                <MapPin className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700">
                  {userLocation.address || 'Getting location…'}
                </p>
                <p className="font-tabular text-[10px] text-slate-400">
                  {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                </p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-7 text-[13px] text-slate-800 placeholder-slate-400 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-2.5 my-auto flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {([
              { id: 'routes', label: 'Routes', Icon: Route },
              { id: 'mountains', label: 'Mountains', Icon: Mountain },
              { id: 'campsites', label: 'Camps', Icon: Tent },
            ] as const).map(tab => {
              const count = tab.id === 'routes'
                ? filteredRoutes.filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                : tab.id === 'mountains'
                ? mountains.filter(m => !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())).length
                : campsites.filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[11px] font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <tab.Icon className="h-3 w-3" />
                  {tab.label}
                  <span className={`rounded px-1 text-[9px] font-semibold ${
                    activeTab === tab.id ? 'bg-slate-100 text-slate-600' : 'text-slate-400'
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Filters — only for routes tab */}
          {activeTab === 'routes' && <RouteFilter onFilterChange={handleFilterChange} />}

          {/* Lists */}
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-8 text-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p className="text-xs text-slate-500">Loading data…</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-medium text-red-600">{error}</p>
            </div>
          ) : (
            <div className="space-y-2">

              {/* ── Routes Tab ── */}
              {activeTab === 'routes' && (() => {
                const list = filteredRoutes.filter(r =>
                  !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
                    <Search className="mx-auto h-5 w-5 text-slate-300" />
                    <p className="mt-2 text-xs text-slate-400">No routes found</p>
                  </div>
                );
                const difficultyStyle: Record<string, { pill: string; dot: string }> = {
                  easy:     { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
                  moderate: { pill: 'bg-amber-50 text-amber-700',     dot: 'bg-amber-400' },
                  hard:     { pill: 'bg-red-50 text-red-700',         dot: 'bg-red-400' },
                };
                const activityIcons: Record<string, React.ReactNode> = {
                  bike: <Route className="h-3.5 w-3.5" />,
                  hike: <Mountain className="h-3.5 w-3.5" />,
                  tour: <Route className="h-3.5 w-3.5" />,
                  run:  <TrendingUp className="h-3.5 w-3.5" />,
                };
                return list.map(route => {
                  const ds = difficultyStyle[route.difficulty] ?? { pill: 'bg-slate-50 text-slate-600', dot: 'bg-slate-400' };
                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => handleRouteClick(route)}
                      className="group w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-[13px] font-semibold text-slate-900 group-hover:text-blue-700">{route.name}</p>
                        <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded ${ds.pill}`}>
                          {activityIcons[route.activity_type] ?? <Mountain className="h-3.5 w-3.5" />}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ds.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${ds.dot}`} />
                          {route.difficulty}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{route.activity_type}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                        <span className="font-tabular font-medium text-slate-700">{route.distance_km.toFixed(1)} km</span>
                        <span className="text-slate-300">·</span>
                        <span className="flex items-center gap-0.5">
                          <ArrowUpDown className="h-3 w-3" />
                          <span className="font-tabular">{route.elevation_gain_m} m</span>
                        </span>
                      </div>
                    </button>
                  );
                });
              })()}

              {/* ── Mountains Tab ── */}
              {activeTab === 'mountains' && (() => {
                const list = mountains.filter(m =>
                  !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
                    <Mountain className="mx-auto h-5 w-5 text-slate-300" />
                    <p className="mt-2 text-xs text-slate-400">No mountains found</p>
                  </div>
                );
                return list.map(mountain => (
                  <button
                    key={mountain.id}
                    type="button"
                    onClick={() => handleMountainClick(mountain)}
                    className="group w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[13px] font-semibold text-slate-900 group-hover:text-blue-700">{mountain.name}</p>
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-slate-100">
                        <Mountain className="h-3.5 w-3.5 text-slate-500" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-slate-50 text-slate-600 capitalize">
                        {mountain.mountain_type}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="font-tabular font-medium text-slate-700">{mountain.elevation_m} m</span>
                      {mountain.prominence_m ? (
                        <><span className="text-slate-300">·</span>
                        <span className="font-tabular">{mountain.prominence_m} m prom</span></>
                      ) : null}
                    </div>
                  </button>
                ));
              })()}

              {/* ── Campsites Tab ── */}
              {activeTab === 'campsites' && (() => {
                const list = campsites.filter(c =>
                  !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
                );
                if (list.length === 0) return (
                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
                    <Tent className="mx-auto h-5 w-5 text-slate-300" />
                    <p className="mt-2 text-xs text-slate-400">No campsites found</p>
                  </div>
                );
                return list.map(campsite => (
                  <button
                    key={campsite.id}
                    type="button"
                    onClick={() => handleCampsiteClick(campsite)}
                    className="group w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-[13px] font-semibold text-slate-900 group-hover:text-emerald-700">{campsite.name}</p>
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-emerald-50">
                        <Tent className="h-3.5 w-3.5 text-emerald-600" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-emerald-50 text-emerald-700 capitalize">
                        {campsite.type}
                      </span>
                      {campsite.rating && (
                        <span className="font-tabular text-[10px] text-slate-500">
                          ★ {campsite.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </button>
                ));
              })()}

            </div>
          )}
        </aside>

        {/* Map View */}
        <div className="flex-1">
          <MapView 
            routes={filteredRoutes} 
            mountains={mountains}
            campsites={campsites}
            userLocation={userLocation ? [userLocation.lng, userLocation.lat] : undefined}
            onRouteClick={handleRouteClick}
            onMountainClick={handleMountainClick}
            onCampsiteClick={handleCampsiteClick}
            onFocusUserLocation={(fn) => { focusUserLocationRef.current = fn; }}
          />
        </div>
      </div>

      <DetailsModal
        isOpen={selectedDetails !== null}
        onClose={() => setSelectedDetails(null)}
        data={
          selectedDetails?.type === 'route'
            ? {
                type: 'route' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                distance_km: selectedDetails.data.distance_km,
                elevation_gain_m: selectedDetails.data.elevation_gain_m,
                difficulty: selectedDetails.data.difficulty,
                activity_type: selectedDetails.data.activity_type,
                photos: selectedDetails.data.photos,
                jumpoff_elevation: selectedDetails.data.jumpoff_elevation,
                summit_elevation: selectedDetails.data.summit_elevation,
                strava_segment: selectedDetails.data.strava_segment,
              }
            : selectedDetails?.type === 'mountain'
            ? {
                type: 'mountain' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                elevation_m: selectedDetails.data.elevation_m,
                prominence_m: selectedDetails.data.prominence_m || 0,
                mountain_type: selectedDetails.data.mountain_type || 'peak',
                jumpoff_elevation: selectedDetails.data.jumpoff_elevation,
                summit_elevation: selectedDetails.data.summit_elevation,
                photos: selectedDetails.data.photos,
                strava_segment: selectedDetails.data.strava_segment,
              }
            : selectedDetails?.type === 'campsite'
            ? {
                type: 'campsite' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                campsite_type: selectedDetails.data.type || 'campsite',
                rating: selectedDetails.data.rating,
                amenities: selectedDetails.data.amenities || [],
                photos: selectedDetails.data.photos,
              }
            : null
        }
      />
    </main>
  );
}

