"use client";

// Fit Ready IQ - Main Page
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useJsApiLoader } from "@react-google-maps/api";
import RouteFilter, { FilterState } from "@/components/RouteFilter";
import ConnectDevicesModal from "@/components/ConnectDevicesModal";
import DetailsModal from "@/components/DetailsModal";

const libraries: ("places" | "geometry")[] = ["places", "geometry"];

// Dynamically import MapView to avoid SSR issues with mapbox-gl
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
        <p className="text-gray-600">Loading map...</p>
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
        console.warn('Google Maps API not loaded, using fallback photos');
        return [
          'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
          'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=800&h=600&fit=crop',
        ];
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
              console.log('Successfully fetched', photoUrls.length, 'photos');
              resolve(photoUrls);
            } else {
              console.log('Using fallback photos, status:', status);
              // Fallback to mock photos if API fails
              resolve([
                'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
                'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
                'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=800&h=600&fit=crop',
              ]);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error in fetchPlacePhotos:', error);
      return [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
        'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=800&h=600&fit=crop',
      ];
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
            placesService.nearbySearch(
              {
                location: { lat: userCoords[1], lng: userCoords[0] },
                radius: 50000, // 50km radius
                type: 'natural_feature',
                keyword: 'mountain peak summit',
              },
              async (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                  const mountainPromises = results
                    .filter(place => 
                      place.name && 
                      place.geometry?.location &&
                      (place.name.toLowerCase().includes('mount') ||
                       place.name.toLowerCase().includes('mountain') ||
                       place.name.toLowerCase().includes('peak') ||
                       place.name.toLowerCase().includes('summit'))
                    )
                    .slice(0, 15) // Limit to 15 mountains
                    .map(async (place, index) => {
                      const elevation = Math.floor(Math.random() * 3000) + 500; // 500-3500m estimate
                      const prominence = Math.floor(elevation * (0.2 + Math.random() * 0.4)); // 20-60% of elevation
                      const jumpoff = Math.floor(elevation * (0.3 + Math.random() * 0.3)); // 30-60% of summit
                      
                      // Fetch photos if place_id is available
                      let photos: string[] = [];
                      if (place.place_id) {
                        try {
                          photos = await fetchPlacePhotos(place.place_id);
                        } catch (e) {
                          console.log('Photo fetch failed for', place.name);
                          photos = [
                            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
                            'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
                            'https://images.unsplash.com/photo-1519904981063-b0cf448d479e?w=800&h=600&fit=crop',
                          ];
                        }
                      } else {
                        photos = [
                          'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
                          'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
                        ];
                      }
                      
                      const distance = Math.random() * 8 + 2; // 2-10km trail
                      
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
                  console.log('Mountains loaded with photos:', mountainData.map(m => ({ name: m.name, photoCount: m.photos?.length, hasStrava: !!m.strava_segment })));
                  resolve(mountainData);
                } else {
                  console.error('Places API error:', status);
                  resolve([]);
                }
              }
            );
          });
        } catch (err) {
          console.error('Mountain fetch error:', err);
          mountains = [];
        }

        // Fetch routes from Komoot/Strava APIs (for now using nearby hiking/biking trails)
        let routes: Route[] = [];
        try {
          const placesService = new google.maps.places.PlacesService(
            document.createElement('div')
          );

          routes = await new Promise(async (resolve) => {
            placesService.nearbySearch(
              {
                location: { lat: userCoords[1], lng: userCoords[0] },
                radius: 25000, // 25km radius
                type: 'park',
                keyword: 'hiking trail biking running',
              },
              async (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                  const routePromises = results
                    .filter(place => place.name && place.geometry?.location)
                    .slice(0, 20)
                    .map(async (place, index) => {
                      // Determine activity type based on name
                      const name = place.name!.toLowerCase();
                      let activityType = 'hike';
                      if (name.includes('bike') || name.includes('cycling')) {
                        activityType = 'bike';
                      } else if (name.includes('run')) {
                        activityType = 'run';
                      }

                      // Estimate difficulty based on rating
                      let difficulty = 'moderate';
                      if (place.rating && place.rating >= 4.5) {
                        difficulty = 'easy';
                      } else if (place.rating && place.rating < 3.5) {
                        difficulty = 'hard';
                      }

                      const distance = Math.random() * 15 + 2; // 2-17km
                      const elevation = Math.floor(Math.random() * 800 + 50); // 50-850m
                      const jumpoff = Math.floor(Math.random() * 300 + 100); // 100-400m
                      
                      // Fetch photos if place_id is available
                      let photos: string[] = [];
                      if (place.place_id) {
                        try {
                          photos = await fetchPlacePhotos(place.place_id);
                        } catch (e) {
                          console.log('Photo fetch failed for', place.name);
                          photos = [
                            'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&h=600&fit=crop',
                            'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&h=600&fit=crop',
                            'https://images.unsplash.com/photo-1486218119243-13883505764c?w=800&h=600&fit=crop',
                          ];
                        }
                      } else {
                        photos = [
                          'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&h=600&fit=crop',
                          'https://images.unsplash.com/photo-1445308394109-4ec2920981b1?w=800&h=600&fit=crop',
                        ];
                      }

                      return {
                        id: `r${index + 1}`,
                        name: place.name || 'Trail',
                        coordinates: [
                          place.geometry!.location!.lng(),
                          place.geometry!.location!.lat(),
                        ] as [number, number],
                        distance_km: distance,
                        elevation_gain_m: elevation,
                        difficulty,
                        activity_type: activityType,
                        photos,
                        jumpoff_elevation: jumpoff,
                        summit_elevation: jumpoff + elevation,
                        strava_segment: generateStravaSegment(place.name || 'Trail', distance, elevation),
                      };
                    });
                  
                  const routeData = await Promise.all(routePromises);
                  console.log('Routes loaded with photos:', routeData.map(r => ({ name: r.name, photoCount: r.photos?.length, hasStrava: !!r.strava_segment })));
                  resolve(routeData);
                } else {
                  console.error('Places API error:', status);
                  resolve([]);
                }
              }
            );
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
            placesService.nearbySearch(
              {
                location: { lat: userCoords[1], lng: userCoords[0] },
                radius: 30000, // 30km radius
                type: 'campground',
              },
              async (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                  const campsitePromises = results
                    .filter(place => place.name && place.geometry?.location)
                    .slice(0, 15)
                    .map(async (place, index) => {
                      // Fetch photos if place_id is available
                      let photos: string[] = [];
                      if (place.place_id) {
                        try {
                          photos = await fetchPlacePhotos(place.place_id);
                        } catch (e) {
                          console.log('Photo fetch failed for', place.name);
                          photos = [
                            'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop',
                            'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=600&fit=crop',
                            'https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?w=800&h=600&fit=crop',
                          ];
                        }
                      } else {
                        photos = [
                          'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&h=600&fit=crop',
                          'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&h=600&fit=crop',
                        ];
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
                        amenities: [], // Could be expanded with place details API
                        photos,
                      };
                    });
                  
                  const campsiteData = await Promise.all(campsitePromises);
                  console.log('Campsites loaded with photos:', campsiteData.map(c => ({ name: c.name, photoCount: c.photos?.length })));
                  resolve(campsiteData);
                } else {
                  console.error('Places API error:', status);
                  resolve([]);
                }
              }
            );
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
      <header className="z-20 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fit Ready IQ</h1>
            <p className="text-sm text-gray-600">
              Discover routes near you - Hiking, Biking & Running
            </p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsDeviceModalOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Connect Devices
            </button>
            <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Profile
            </button>
          </div>
        </div>
      </header>

      {/* Connect Devices Modal */}
      <ConnectDevicesModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar with Filters */}
        <aside className="w-80 overflow-y-auto border-r border-gray-200 bg-gray-50 p-4">
          {/* Current Location */}
          {userLocation && (
            <div className="mb-4 rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-1 text-2xl">📍</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Current Location
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {userLocation.address || 'Getting your location...'}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                    <span>Lat: {userLocation.lat.toFixed(4)}</span>
                    <span>Lng: {userLocation.lng.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <RouteFilter onFilterChange={handleFilterChange} />

          {/* Route List */}
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="rounded-lg bg-white p-4 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading routes...</p>
              </div>
            ) : error ? (
              <div className="rounded-lg bg-red-50 p-4 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className="rounded-lg bg-white p-4 text-center">
                <p className="text-sm text-gray-600">
                  No routes match your filters
                </p>
              </div>
            ) : (
              filteredRoutes.map((route) => (
                <div
                  key={route.id}
                  onClick={() => handleRouteClick(route)}
                  className="cursor-pointer rounded-lg bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <h3 className="font-semibold text-gray-900">{route.name}</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Distance:</span>{" "}
                      {route.distance_km.toFixed(1)} km
                    </div>
                    <div>
                      <span className="font-medium">Elevation:</span>{" "}
                      {route.elevation_gain_m} m
                    </div>
                    <div>
                      <span className="font-medium">Difficulty:</span>{" "}
                      <span className="capitalize">{route.difficulty}</span>
                    </div>
                    <div>
                      <span className="font-medium">Type:</span>{" "}
                      <span className="capitalize">{route.activity_type}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
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
              }
            : selectedDetails?.type === 'mountain'
            ? {
                type: 'mountain' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                elevation_m: selectedDetails.data.elevation_m,
                prominence_m: selectedDetails.data.prominence_m || 0,
                mountain_type: selectedDetails.data.type,
              }
            : selectedDetails?.type === 'campsite'
            ? {
                type: 'campsite' as const,
                id: selectedDetails.data.id,
                name: selectedDetails.data.name,
                coordinates: selectedDetails.data.coordinates,
                campsite_type: selectedDetails.data.type,
                rating: selectedDetails.data.rating,
                amenities: selectedDetails.data.amenities || [],
              }
            : null
        }
      />
    </main>
  );
}

