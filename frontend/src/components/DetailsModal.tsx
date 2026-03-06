'use client';

// Enhanced modal with Komoot-style elevation profile, photos, and Strava segments
import { X, TrendingUp, TrendingDown, Mountain, Navigation, Tent, Star, Camera, Award, MapPin } from 'lucide-react';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface RouteDetails {
  type: 'route';
  id: string;
  name: string;
  coordinates: [number, number];
  distance_km: number;
  elevation_gain_m: number;
  difficulty: string;
  activity_type: string;
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

interface MountainDetails {
  type: 'mountain';
  id: string;
  name: string;
  coordinates: [number, number];
  elevation_m: number;
  prominence_m: number;
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

interface CampsiteDetails {
  type: 'campsite';
  id: string;
  name: string;
  coordinates: [number, number];
  campsite_type: string;
  rating?: number;
  amenities?: string[];
  photos?: string[];
}

type DetailsData = RouteDetails | MountainDetails | CampsiteDetails;

interface DetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DetailsData | null;
}

export default function DetailsModal({ isOpen, onClose, data }: DetailsModalProps) {
  if (!isOpen || !data) return null;

  // Debug log
  console.log('DetailsModal data:', {
    type: data.type,
    name: data.type === 'route' ? data.name : data.type === 'mountain' ? data.name : data.name,
    photoCount: data.type === 'route' ? data.photos?.length : data.type === 'mountain' ? data.photos?.length : data.photos?.length,
    hasStrava: data.type === 'route' ? !!data.strava_segment : data.type === 'mountain' ? !!data.strava_segment : false,
    photos: data.type === 'route' ? data.photos : data.type === 'mountain' ? data.photos : data.photos,
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-green-600 bg-green-50';
      case 'moderate':
        return 'text-orange-600 bg-orange-50';
      case 'hard':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getActivityEmoji = (type: string) => {
    switch (type) {
      case 'hike':
        return '🥾';
      case 'bike':
        return '🚴';
      case 'run':
        return '🏃';
      default:
        return '🗺️';
    }
  };

  // Calculate elevation metrics for routes
  const calculateElevationMetrics = (route: RouteDetails) => {
    const elevationGain = route.elevation_gain_m;
    const elevationLoss = Math.floor(elevationGain * 0.3); // Estimate: ~30% of gain
    const distance = route.distance_km;
    
    // Calculate average grade (elevation gain / horizontal distance * 100)
    const averageGrade = ((elevationGain / (distance * 1000)) * 100).toFixed(1);
    
    // Estimate max grade based on difficulty
    const maxGrade = route.difficulty === 'hard' 
      ? (parseFloat(averageGrade) * 2.5).toFixed(1)
      : route.difficulty === 'moderate'
      ? (parseFloat(averageGrade) * 2).toFixed(1)
      : (parseFloat(averageGrade) * 1.5).toFixed(1);
    
    // Estimate starting elevation (base)
    const startElevation = 100 + Math.floor(Math.random() * 500);
    const summitElevation = startElevation + elevationGain;
    
    return {
      elevationGain,
      elevationLoss,
      averageGrade: parseFloat(averageGrade),
      maxGrade: parseFloat(maxGrade),
      startElevation,
      summitElevation,
      lowestPoint: startElevation - elevationLoss,
      highestPoint: summitElevation,
    };
  };

  // Generate elevation profile points for visualization
  const generateElevationProfile = (route: RouteDetails) => {
    const metrics = calculateElevationMetrics(route);
    const points: { distance: number; elevation: number }[] = [];
    const segments = 20; // Number of points in profile
    
    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const distance = route.distance_km * progress;
      
      // Create a realistic elevation curve
      let elevation: number;
      if (progress < 0.7) {
        // Gradual climb to 70% of route
        elevation = metrics.startElevation + (metrics.elevationGain * (progress / 0.7) * 0.9);
      } else if (progress < 0.85) {
        // Steeper section
        const localProgress = (progress - 0.7) / 0.15;
        elevation = metrics.startElevation + (metrics.elevationGain * 0.9) + 
                   (metrics.elevationGain * 0.1 * localProgress);
      } else {
        // Final summit push with slight undulation
        const localProgress = (progress - 0.85) / 0.15;
        elevation = metrics.summitElevation - (10 * Math.sin(localProgress * Math.PI));
      }
      
      // Add some natural variation
      elevation += Math.sin(progress * Math.PI * 4) * 15;
      
      points.push({ distance, elevation });
    }
    
    return points;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-200/80 bg-white/95 backdrop-blur-xl p-6 rounded-t-2xl">
          <div className="flex-1 pr-8">
            <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
              {data.type === 'route' ? getActivityEmoji(data.activity_type) : data.type === 'mountain' ? '⛰️' : '⛺'}{' '}
              {data.name}
            </h2>
            <p className="mt-2 text-sm font-medium text-gray-500 uppercase tracking-wider">
              {data.type === 'route' ? 'Trail / Route' : data.type === 'mountain' ? 'Mountain / Peak' : 'Campsite'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-200 hover:scale-110"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {data.type === 'route' ? (
            (() => {
              const metrics = calculateElevationMetrics(data);
              const profilePoints = generateElevationProfile(data);
              const minElevation = Math.min(...profilePoints.map(p => p.elevation));
              const maxElevation = Math.max(...profilePoints.map(p => p.elevation));
              const elevationRange = maxElevation - minElevation;

              // Determine profile type
              const isCycling = data.activity_type === 'bike';
              const isTrailRun = data.activity_type === 'run' || data.activity_type === 'hike';
              const profileTitle = isCycling ? '🚴 Cycling Profile' : isTrailRun ? '🏃 Trail Runner Profile' : '🗺️ Route Profile';
              const profileDescription = isCycling 
                ? 'Complete cycling route analysis with terrain, grade, and performance metrics'
                : isTrailRun 
                ? 'Comprehensive trail running profile with elevation, pace zones, and terrain details'
                : 'Detailed route information for outdoor activities';

              return (
                <div className="space-y-6">
                  {/* Profile Header Banner */}
                  <div className={`rounded-xl p-6 shadow-lg ring-1 ${
                    isCycling 
                      ? 'bg-gradient-to-br from-blue-600 to-blue-700 ring-blue-500/50' 
                      : 'bg-gradient-to-br from-green-600 to-green-700 ring-green-500/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-white mb-2">{profileTitle}</h3>
                        <p className="text-sm text-white/90">{profileDescription}</p>
                      </div>
                      <div className={`rounded-full p-4 ${
                        isCycling ? 'bg-blue-500/30' : 'bg-green-500/30'
                      }`}>
                        <span className="text-4xl">{isCycling ? '🚴' : isTrailRun ? '🏃' : '🗺️'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-sm ring-1 ring-blue-200/50 hover:shadow-md transition-all duration-200">
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Distance</p>
                      <p className="mt-2 text-3xl font-bold text-blue-900">
                        {data.distance_km.toFixed(1)} km
                      </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 shadow-sm ring-1 ring-purple-200/50 hover:shadow-md transition-all duration-200">
                      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Elevation Gain</p>
                      <p className="mt-2 text-3xl font-bold text-purple-900">
                        {data.elevation_gain_m} m
                      </p>
                    </div>
                    <div className={`rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 ${getDifficultyColor(data.difficulty)}`}>
                      <p className="text-xs font-semibold uppercase tracking-wider">Difficulty</p>
                      <p className="mt-2 text-3xl font-bold capitalize">
                        {data.difficulty}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-5 shadow-sm ring-1 ring-green-200/50 hover:shadow-md transition-all duration-200">
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Activity</p>
                      <p className="mt-2 text-3xl font-bold text-green-900 capitalize">
                        {data.activity_type}
                      </p>
                    </div>
                  </div>

                  {/* Photos Gallery */}
                  {data.photos && data.photos.length > 0 && (
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <Camera className="w-6 h-6 mr-3 text-blue-600" />
                        Photos
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {data.photos.slice(0, 6).map((photo, index) => (
                          <div key={index} className="relative group cursor-pointer rounded-xl overflow-hidden aspect-square shadow-md hover:shadow-xl transition-all duration-300 ring-1 ring-gray-200/50">
                            <Image
                              src={photo}
                              alt={`${data.name} - Photo ${index + 1}`}
                              fill
                              className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:rotate-1"
                              sizes="(max-width: 768px) 50vw, 33vw"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strava Segment Records */}
                  {data.strava_segment && (
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                        <Award className="w-6 h-6 mr-3 text-orange-600" />
                        Strava Segment Records
                      </h3>
                      <div className="rounded-xl bg-gradient-to-br from-orange-50 via-orange-50 to-orange-100 border border-orange-200/50 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900">{data.strava_segment.name}</h4>
                          <span className="text-xs font-medium text-orange-700 bg-orange-200 px-2 py-1 rounded-full">
                            {data.strava_segment.total_efforts || 0} efforts
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs text-gray-600 mb-1">Distance</p>
                            <p className="text-lg font-bold text-gray-900">{data.strava_segment.distance.toFixed(1)} km</p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs text-gray-600 mb-1">Avg Grade</p>
                            <p className="text-lg font-bold text-gray-900">{data.strava_segment.avg_grade.toFixed(1)}%</p>
                          </div>
                        </div>
                        {(data.strava_segment.kom_time || data.strava_segment.qom_time) && (
                          <div className="grid grid-cols-2 gap-4">
                            {data.strava_segment.kom_time && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-blue-700 mb-1">🏆 KOM</p>
                                <p className="text-lg font-bold text-blue-900">{data.strava_segment.kom_time}</p>
                              </div>
                            )}
                            {data.strava_segment.qom_time && (
                              <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-pink-700 mb-1">🏆 QOM</p>
                                <p className="text-lg font-bold text-pink-900">{data.strava_segment.qom_time}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Elevation Profile - Komoot Style */}
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Elevation Profile</h3>
                    <div className="rounded-xl bg-gradient-to-b from-blue-50 via-blue-50/50 to-white border border-gray-200/50 p-6 shadow-lg">
                      {/* Elevation Chart */}
                      <div className="relative h-48 mb-4">
                        <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
                          {/* Grid lines */}
                          <line x1="0" y1="37.5" x2="400" y2="37.5" stroke="#e5e7eb" strokeWidth="1" />
                          <line x1="0" y1="75" x2="400" y2="75" stroke="#e5e7eb" strokeWidth="1" />
                          <line x1="0" y1="112.5" x2="400" y2="112.5" stroke="#e5e7eb" strokeWidth="1" />
                          
                          {/* Elevation area */}
                          <defs>
                            <linearGradient id="elevationGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
                              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
                            </linearGradient>
                          </defs>
                          
                          <path
                            d={`M 0 150 ${profilePoints.map((point, index) => {
                              const x = (index / (profilePoints.length - 1)) * 400;
                              const y = 150 - ((point.elevation - minElevation) / elevationRange) * 140;
                              return `L ${x} ${y}`;
                            }).join(' ')} L 400 150 Z`}
                            fill="url(#elevationGradient)"
                          />
                          
                          {/* Elevation line */}
                          <path
                            d={`M ${profilePoints.map((point, index) => {
                              const x = (index / (profilePoints.length - 1)) * 400;
                              const y = 150 - ((point.elevation - minElevation) / elevationRange) * 140;
                              return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
                            }).join(' ')}`}
                            stroke="#3b82f6"
                            strokeWidth="3"
                            fill="none"
                          />
                          
                          {/* Start marker */}
                          <circle cx="0" cy={150 - ((profilePoints[0].elevation - minElevation) / elevationRange) * 140} r="5" fill="#10b981" stroke="white" strokeWidth="2" />
                          
                          {/* End marker */}
                          <circle cx="400" cy={150 - ((profilePoints[profilePoints.length - 1].elevation - minElevation) / elevationRange) * 140} r="5" fill="#ef4444" stroke="white" strokeWidth="2" />
                        </svg>
                        
                        {/* Elevation labels */}
                        <div className="absolute top-0 left-0 text-xs text-gray-500">{Math.round(maxElevation)}m</div>
                        <div className="absolute bottom-0 left-0 text-xs text-gray-500">{Math.round(minElevation)}m</div>
                      </div>
                      
                      {/* Distance markers */}
                      <div className="flex justify-between text-xs text-gray-600 mb-4 px-1">
                        <span>0 km</span>
                        <span>{(data.distance_km / 2).toFixed(1)} km</span>
                        <span>{data.distance_km.toFixed(1)} km</span>
                      </div>

                      {/* Elevation Details Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-200">
                        <div className="text-center">
                          <div className="flex items-center justify-center text-green-600 mb-1">
                            <TrendingUp className="w-4 h-4 mr-1" />
                            <span className="text-xs font-medium">Ascent</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900">{metrics.elevationGain}m</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center text-red-600 mb-1">
                            <TrendingDown className="w-4 h-4 mr-1" />
                            <span className="text-xs font-medium">Descent</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900">{metrics.elevationLoss}m</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center text-blue-600 mb-1">
                            <Mountain className="w-4 h-4 mr-1" />
                            <span className="text-xs font-medium">Highest</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900">{metrics.highestPoint}m</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center text-gray-600 mb-1">
                            <Navigation className="w-4 h-4 mr-1" />
                            <span className="text-xs font-medium">Lowest</span>
                          </div>
                          <p className="text-lg font-bold text-gray-900">{metrics.lowestPoint}m</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grade Information */}
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Grade & Terrain</h3>
                    <div className="mt-2 grid grid-cols-2 gap-4">
                      <div className="rounded-xl bg-gradient-to-br from-orange-50 via-orange-50 to-orange-100 p-6 border border-orange-200/50 shadow-md hover:shadow-lg transition-all duration-200">
                        <p className="text-sm font-medium text-orange-800 mb-2">Average Grade</p>
                        <p className="text-3xl font-bold text-orange-900">{metrics.averageGrade}%</p>
                        <p className="text-xs text-orange-700 mt-1">
                          {metrics.averageGrade < 5 ? 'Gentle slope' : 
                           metrics.averageGrade < 10 ? 'Moderate climb' : 
                           metrics.averageGrade < 15 ? 'Steep ascent' : 'Very steep'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gradient-to-br from-red-50 to-red-100 p-4 border border-red-200">
                        <p className="text-sm font-medium text-red-800 mb-2">Maximum Grade</p>
                        <p className="text-3xl font-bold text-red-900">{metrics.maxGrade}%</p>
                        <p className="text-xs text-red-700 mt-1">
                          Steepest section of trail
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Jumpoff to Summit */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Route Summary</h3>
                    <div className="mt-2 rounded-lg bg-gray-50 p-4 space-y-3">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-green-500 mr-3"></div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Starting Point (Jumpoff)</p>
                            <p className="text-xs text-gray-600">Trail beginning</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{metrics.startElevation}m</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-red-500 mr-3"></div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Summit / Endpoint</p>
                            <p className="text-xs text-gray-600">Highest point reached</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{metrics.summitElevation}m</p>
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-700">Total Elevation Change</p>
                          <p className="text-xl font-bold text-blue-600">+{metrics.elevationGain}m</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Location</h3>
                <div className="mt-2 rounded-lg bg-gray-50 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Latitude</p>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {data.coordinates[1].toFixed(6)}°
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Longitude</p>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {data.coordinates[0].toFixed(6)}°
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Estimated Time */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Estimated Time</h3>
                <div className="mt-2 rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">
                    Based on distance and elevation gain
                  </p>
                  <p className="mt-1 text-lg font-medium text-gray-900">
                    {(() => {
                      const baseTime = isCycling 
                        ? data.distance_km * 3.5  // ~17 km/h avg cycling speed
                        : data.distance_km * 15;  // 15 min per km for running/hiking
                      const elevationTime = isCycling
                        ? data.elevation_gain_m * 0.3  // Less elevation penalty for cycling
                        : data.elevation_gain_m * 0.5; // 0.5 min per meter for running/hiking
                      const totalMinutes = Math.round(baseTime + elevationTime);
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      return `${hours}h ${minutes}m`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Activity-Specific Profile Details */}
              {isCycling ? (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">🚴 Cycling Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-md ring-1 ring-blue-200/50">
                      <p className="text-sm font-semibold text-blue-700 mb-2">Avg Speed Zone</p>
                      <p className="text-2xl font-bold text-blue-900 mb-1">
                        {metrics.averageGrade < 3 ? '25-30 km/h' : metrics.averageGrade < 6 ? '18-25 km/h' : '12-18 km/h'}
                      </p>
                      <p className="text-xs text-blue-700">
                        {metrics.averageGrade < 3 ? 'Fast rolling terrain' : metrics.averageGrade < 6 ? 'Moderate climbing' : 'Steep climbs'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 shadow-md ring-1 ring-purple-200/50">
                      <p className="text-sm font-semibold text-purple-700 mb-2">Bike Type</p>
                      <p className="text-2xl font-bold text-purple-900 mb-1">
                        {data.difficulty === 'easy' ? 'Road / Hybrid' : data.difficulty === 'moderate' ? 'Gravel / MTB' : 'Mountain Bike'}
                      </p>
                      <p className="text-xs text-purple-700">Recommended bike category</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-5 shadow-md ring-1 ring-green-200/50">
                      <p className="text-sm font-semibold text-green-700 mb-2">Power Output</p>
                      <p className="text-2xl font-bold text-green-900 mb-1">
                        {metrics.averageGrade < 4 ? '180-220W' : metrics.averageGrade < 8 ? '220-280W' : '280-350W'}
                      </p>
                      <p className="text-xs text-green-700">Estimated avg watts</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 p-5 shadow-md ring-1 ring-orange-200/50">
                      <p className="text-sm font-semibold text-orange-700 mb-2">Technical Level</p>
                      <p className="text-2xl font-bold text-orange-900 mb-1">
                        {data.difficulty === 'easy' ? 'Basic' : data.difficulty === 'moderate' ? 'Intermediate' : 'Advanced'}
                      </p>
                      <p className="text-xs text-orange-700">
                        {data.difficulty === 'easy' ? 'Smooth surfaces' : data.difficulty === 'moderate' ? 'Mixed terrain' : 'Technical sections'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : isTrailRun ? (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">🏃 Trail Running Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-5 shadow-md ring-1 ring-green-200/50">
                      <p className="text-sm font-semibold text-green-700 mb-2">Pace Zone</p>
                      <p className="text-2xl font-bold text-green-900 mb-1">
                        {metrics.averageGrade < 5 ? '5:00-6:30' : metrics.averageGrade < 10 ? '6:30-8:00' : '8:00-10:00'}
                      </p>
                      <p className="text-xs text-green-700">min/km estimated pace</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-md ring-1 ring-blue-200/50">
                      <p className="text-sm font-semibold text-blue-700 mb-2">Effort Level</p>
                      <p className="text-2xl font-bold text-blue-900 mb-1">
                        {data.difficulty === 'easy' ? 'Easy' : data.difficulty === 'moderate' ? 'Moderate' : 'Hard'}
                      </p>
                      <p className="text-xs text-blue-700">
                        {data.difficulty === 'easy' ? 'Conversational pace' : data.difficulty === 'moderate' ? 'Tempo effort' : 'High intensity'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 shadow-md ring-1 ring-purple-200/50">
                      <p className="text-sm font-semibold text-purple-700 mb-2">Terrain Type</p>
                      <p className="text-2xl font-bold text-purple-900 mb-1">
                        {data.difficulty === 'easy' ? 'Trail' : data.difficulty === 'moderate' ? 'Mixed' : 'Technical'}
                      </p>
                      <p className="text-xs text-purple-700">
                        {data.difficulty === 'easy' ? 'Groomed trails' : data.difficulty === 'moderate' ? 'Rocky sections' : 'Scrambling required'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 p-5 shadow-md ring-1 ring-orange-200/50">
                      <p className="text-sm font-semibold text-orange-700 mb-2">Footwear</p>
                      <p className="text-2xl font-bold text-orange-900 mb-1">
                        {data.difficulty === 'easy' ? 'Trail Shoes' : data.difficulty === 'moderate' ? 'Trail + Grip' : 'Technical'}
                      </p>
                      <p className="text-xs text-orange-700">Recommended shoe type</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">About This Route</h3>
                <div className="mt-2 rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">
                    This is a {data.difficulty} {data.activity_type} route covering{' '}
                    {data.distance_km.toFixed(1)} km with {data.elevation_gain_m} meters of
                    elevation gain. The route is suitable for{' '}
                    {data.difficulty === 'easy'
                      ? 'beginners and families'
                      : data.difficulty === 'moderate'
                      ? 'intermediate adventurers'
                      : 'experienced athletes'}{' '}
                    looking for a{' '}
                    {data.difficulty === 'hard' ? 'challenging' : 'rewarding'} outdoor
                    experience.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 border-t border-gray-200/80 pt-6">
                <button className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3.5 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transition-all duration-200">
                  Add to Training Plan
                </button>
                <button className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  Get Directions
                </button>
                <button className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  Share
                </button>
              </div>
                </div>
              );
            })()
          ) : data.type === 'mountain' ? (
            <div className="space-y-6">
              {/* Mountaineer Profile Header Banner */}
              <div className="rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 p-6 shadow-lg ring-1 ring-gray-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">⛰️ Mountaineer Profile</h3>
                    <p className="text-sm text-gray-300">Complete mountain climbing analysis with elevation, grade, and route planning</p>
                  </div>
                  <div className="rounded-full bg-gray-700/50 p-4">
                    <span className="text-4xl">⛰️</span>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-sm ring-1 ring-blue-200/50 hover:shadow-md transition-all duration-200">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Elevation</p>
                  <p className="mt-2 text-3xl font-bold text-blue-900">
                    {data.elevation_m} m
                  </p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 shadow-sm ring-1 ring-purple-200/50 hover:shadow-md transition-all duration-200">
                  <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Prominence</p>
                  <p className="mt-2 text-3xl font-bold text-purple-900">
                    {data.prominence_m} m
                  </p>
                </div>
                <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-5 shadow-sm ring-1 ring-green-200/50 hover:shadow-md transition-all duration-200">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Type</p>
                  <p className="mt-2 text-2xl font-bold capitalize text-green-900">
                    {data.mountain_type}
                  </p>
                </div>
              </div>

              {/* Photos Gallery */}
              {data.photos && data.photos.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <Camera className="w-5 h-5 mr-2 text-blue-600" />
                    Photos
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {data.photos.slice(0, 6).map((photo, index) => (
                      <div key={index} className="relative group cursor-pointer rounded-lg overflow-hidden aspect-square">
                        <Image
                          src={photo}
                          alt={`${data.name} - Photo ${index + 1}`}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-110"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strava Segment Records */}
              {data.strava_segment && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                    <Award className="w-6 h-6 mr-3 text-orange-600" />
                    Strava Segment Records
                  </h3>
                  <div className="rounded-xl bg-gradient-to-br from-orange-50 via-orange-50 to-orange-100 border border-orange-200/50 p-6 shadow-lg hover:shadow-xl transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">{data.strava_segment.name}</h4>
                      <span className="text-xs font-medium text-orange-700 bg-orange-200 px-2 py-1 rounded-full">
                        {data.strava_segment.total_efforts || 0} efforts
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Distance</p>
                        <p className="text-lg font-bold text-gray-900">{data.strava_segment.distance.toFixed(1)} km</p>
                      </div>
                      <div className="bg-white rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">Avg Grade</p>
                        <p className="text-lg font-bold text-gray-900">{data.strava_segment.avg_grade.toFixed(1)}%</p>
                      </div>
                    </div>
                    {(data.strava_segment.kom_time || data.strava_segment.qom_time) && (
                      <div className="grid grid-cols-2 gap-4">
                        {data.strava_segment.kom_time && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-blue-700 mb-1">🏆 KOM</p>
                            <p className="text-lg font-bold text-blue-900">{data.strava_segment.kom_time}</p>
                          </div>
                        )}
                        {data.strava_segment.qom_time && (
                          <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-pink-700 mb-1">🏆 QOM</p>
                            <p className="text-lg font-bold text-pink-900">{data.strava_segment.qom_time}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Elevation Profile - For Mountains */}
              {(() => {
                const jumpoffElevation = data.jumpoff_elevation || 0;
                const summitElevation = data.summit_elevation || data.elevation_m;
                const totalGain = summitElevation - jumpoffElevation;
                
                // Estimate distance based on elevation gain (typical 10% avg grade for mountains)
                const estimatedDistance = totalGain > 0 ? (totalGain / 100) : 5; // in km
                
                // Generate elevation profile for mountains
                const elevationProfile: { distance: number; elevation: number }[] = [];
                const segments = 20;
                
                for (let i = 0; i <= segments; i++) {
                  const progress = i / segments;
                  const distance = estimatedDistance * progress;
                  
                  // Create realistic mountain elevation curve
                  let elevation: number;
                  if (progress < 0.7) {
                    elevation = jumpoffElevation + (totalGain * (progress / 0.7) * 0.85);
                  } else if (progress < 0.85) {
                    const localProgress = (progress - 0.7) / 0.15;
                    elevation = jumpoffElevation + (totalGain * 0.85) + (totalGain * 0.1 * localProgress);
                  } else {
                    const localProgress = (progress - 0.85) / 0.15;
                    elevation = summitElevation - (20 * Math.sin(localProgress * Math.PI));
                  }
                  
                  elevation += Math.sin(progress * Math.PI * 4) * 20;
                  elevationProfile.push({ distance, elevation });
                }
                
                const highestPoint = summitElevation;
                const lowestPoint = jumpoffElevation;
                const estimatedDescent = Math.floor(totalGain * 0.15);

                return (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Elevation Profile</h3>
                    <div className="rounded-xl bg-gradient-to-b from-blue-50 to-white p-6 shadow-lg border border-gray-200/50">
                      {/* SVG Elevation Chart */}
                      <div className="relative h-48 mb-6">
                        <svg viewBox="0 0 800 200" className="w-full h-full">
                          {/* Grid lines */}
                          {[0, 1, 2, 3, 4].map((i) => (
                            <line
                              key={i}
                              x1="0"
                              y1={i * 50}
                              x2="800"
                              y2={i * 50}
                              stroke="#e5e7eb"
                              strokeWidth="1"
                            />
                          ))}

                          {/* Elevation path */}
                          <defs>
                            <linearGradient id="elevationGradientMountain" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.3 }} />
                              <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 0.05 }} />
                            </linearGradient>
                          </defs>

                          {/* Area under curve */}
                          <path
                            d={`M 0,200 ${elevationProfile
                              .map((point, i) => {
                                const x = (i / (elevationProfile.length - 1)) * 800;
                                const y = 200 - ((point.elevation - lowestPoint) / (highestPoint - lowestPoint)) * 180;
                                return `L ${x},${y}`;
                              })
                              .join(' ')} L 800,200 Z`}
                            fill="url(#elevationGradientMountain)"
                          />

                          {/* Elevation line */}
                          <path
                            d={`M ${elevationProfile
                              .map((point, i) => {
                                const x = (i / (elevationProfile.length - 1)) * 800;
                                const y = 200 - ((point.elevation - lowestPoint) / (highestPoint - lowestPoint)) * 180;
                                return `${x},${y}`;
                              })
                              .join(' L ')}`}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />

                          {/* Start marker */}
                          <circle cx="0" cy={200 - ((jumpoffElevation - lowestPoint) / (highestPoint - lowestPoint)) * 180} r="6" fill="#10b981" />
                          {/* End marker */}
                          <circle
                            cx="800"
                            cy={200 - ((summitElevation - lowestPoint) / (highestPoint - lowestPoint)) * 180}
                            r="6"
                            fill="#ef4444"
                          />
                        </svg>

                        {/* Distance markers */}
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                          <span>0 km</span>
                          <span>{(estimatedDistance / 2).toFixed(1)} km</span>
                          <span>{estimatedDistance.toFixed(1)} km</span>
                        </div>
                      </div>

                      {/* Elevation Details Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200/50">
                          <div className="flex items-center text-green-600 mb-2">
                            <TrendingUp className="w-4 h-4 mr-1" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Ascent</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{totalGain}m</p>
                        </div>
                        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200/50">
                          <div className="flex items-center text-red-600 mb-2">
                            <TrendingDown className="w-4 h-4 mr-1" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Descent</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{estimatedDescent}m</p>
                        </div>
                        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200/50">
                          <div className="flex items-center text-blue-600 mb-2">
                            <Mountain className="w-4 h-4 mr-1" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Highest</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{highestPoint}m</p>
                        </div>
                        <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200/50">
                          <div className="flex items-center text-purple-600 mb-2">
                            <Navigation className="w-4 h-4 mr-1" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Lowest</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900">{lowestPoint}m</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Grade & Terrain - For Mountains */}
              {(() => {
                const jumpoffElevation = data.jumpoff_elevation || 0;
                const summitElevation = data.summit_elevation || data.elevation_m;
                const totalGain = summitElevation - jumpoffElevation;
                const estimatedDistance = totalGain > 0 ? (totalGain / 100) : 5;
                const averageGrade = totalGain > 0 ? (totalGain / (estimatedDistance * 1000)) * 100 : 0;
                const maxGrade = averageGrade * 1.5; // Estimate max grade

                return (
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Grade & Terrain</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 p-6 shadow-md hover:shadow-lg transition-all duration-200 ring-1 ring-orange-200/50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-orange-700 uppercase tracking-wider">Average Grade</p>
                          <TrendingUp className="w-5 h-5 text-orange-600" />
                        </div>
                        <p className="text-4xl font-bold text-orange-900 mb-2">{averageGrade.toFixed(1)}%</p>
                        <p className="text-xs text-orange-700">
                          {averageGrade < 5
                            ? 'Gentle to moderate climb'
                            : averageGrade < 10
                            ? 'Steady climbing required'
                            : averageGrade < 15
                            ? 'Steep - challenging ascent'
                            : 'Very steep - technical climb'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 p-6 shadow-md hover:shadow-lg transition-all duration-200 ring-1 ring-red-200/50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-red-700 uppercase tracking-wider">Maximum Grade</p>
                          <Mountain className="w-5 h-5 text-red-600" />
                        </div>
                        <p className="text-4xl font-bold text-red-900 mb-2">{maxGrade.toFixed(1)}%</p>
                        <p className="text-xs text-red-700">
                          {maxGrade < 8
                            ? 'Manageable steep sections'
                            : maxGrade < 15
                            ? 'Very steep sections present'
                            : maxGrade < 20
                            ? 'Extreme grades - use caution'
                            : 'Technical climbing required'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Route Summary - For Mountains */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Route Summary</h3>
                <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 shadow-md ring-1 ring-gray-200/50">
                  <div className="space-y-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-4">
                        <span className="text-green-700 font-bold">1</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">Starting Point (Jumpoff)</h4>
                        <p className="text-sm text-gray-600">
                          Begin your climb at {data.jumpoff_elevation || 'the base elevation'}m. Prepare proper gear and check weather conditions before starting.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                        <span className="text-blue-700 font-bold">2</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">The Ascent</h4>
                        <p className="text-sm text-gray-600">
                          Gain {(data.summit_elevation || data.elevation_m) - (data.jumpoff_elevation || 0)}m of elevation through varied terrain. Pace yourself and stay hydrated.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mr-4">
                        <span className="text-red-700 font-bold">3</span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">Summit ({data.summit_elevation || data.elevation_m}m)</h4>
                        <p className="text-sm text-gray-600">
                          Reach the peak and enjoy panoramic views. Take time to rest and capture the moment before descending.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Jumpoff to Summit - For Mountains */}
              {(data.jumpoff_elevation || data.summit_elevation) && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center mb-4">
                    <MapPin className="w-6 h-6 mr-3 text-blue-600" />
                    Elevation Details
                  </h3>
                  <div className="mt-2 rounded-xl bg-gradient-to-br from-blue-50 via-blue-50/50 to-purple-50 border border-blue-200/50 p-6 space-y-4 shadow-lg">
                    {data.jumpoff_elevation && (
                      <div className="flex items-center justify-between pb-3 border-b border-blue-200">
                        <div className="flex items-center">
                          <div className="w-3 h-3 rounded-full bg-green-500 mr-3"></div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Jumpoff Point</p>
                            <p className="text-xs text-gray-600">Starting elevation</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-gray-900">{data.jumpoff_elevation}m</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between pb-3 border-b border-blue-200">
                      <div className="flex items-center">
                        <div className="w-3 h-3 rounded-full bg-red-500 mr-3"></div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Summit</p>
                          <p className="text-xs text-gray-600">Peak elevation</p>
                        </div>
                      </div>
                      <p className="text-lg font-bold text-gray-900">{data.summit_elevation || data.elevation_m}m</p>
                    </div>
                    {data.jumpoff_elevation && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-700">Total Elevation Gain</p>
                          <p className="text-xl font-bold text-blue-600">
                            +{(data.summit_elevation || data.elevation_m) - data.jumpoff_elevation}m
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mountaineer Profile Details */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">⛰️ Mountaineering Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 p-5 shadow-md ring-1 ring-gray-200/50">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Climb Duration</p>
                    <p className="text-2xl font-bold text-gray-900 mb-1">
                      {(() => {
                        const elevGain = (data.summit_elevation || data.elevation_m) - (data.jumpoff_elevation || 0);
                        const hours = Math.round((elevGain / 300) * 2); // ~300m/hour ascent
                        return `${hours}-${hours + 2}h`;
                      })()}
                    </p>
                    <p className="text-xs text-gray-700">Estimated climb time</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-md ring-1 ring-blue-200/50">
                    <p className="text-sm font-semibold text-blue-700 mb-2">Fitness Level</p>
                    <p className="text-2xl font-bold text-blue-900 mb-1">
                      {data.elevation_m > 3000 ? 'Elite' : data.elevation_m > 2000 ? 'Advanced' : data.elevation_m > 1000 ? 'Intermediate' : 'Beginner'}
                    </p>
                    <p className="text-xs text-blue-700">Required fitness</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 p-5 shadow-md ring-1 ring-red-200/50">
                    <p className="text-sm font-semibold text-red-700 mb-2">Gear Required</p>
                    <p className="text-2xl font-bold text-red-900 mb-1">
                      {data.elevation_m > 3000 ? 'Full Alpine' : data.elevation_m > 2000 ? 'Technical' : 'Standard'}
                    </p>
                    <p className="text-xs text-red-700">
                      {data.elevation_m > 3000 ? 'Crampons, ice axe' : data.elevation_m > 2000 ? 'Poles, proper boots' : 'Hiking essentials'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 shadow-md ring-1 ring-purple-200/50">
                    <p className="text-sm font-semibold text-purple-700 mb-2">Acclimatization</p>
                    <p className="text-2xl font-bold text-purple-900 mb-1">
                      {data.elevation_m > 3000 ? 'Required' : data.elevation_m > 2500 ? 'Recommended' : 'Not Needed'}
                    </p>
                    <p className="text-xs text-purple-700">
                      {data.elevation_m > 3000 ? '2-3 days minimum' : data.elevation_m > 2500 ? '1 day advised' : 'Direct ascent OK'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Location</h3>
                <div className="mt-2 rounded-lg bg-gray-50 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Latitude</p>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {data.coordinates[1].toFixed(6)}°
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Longitude</p>
                      <p className="font-mono text-sm font-medium text-gray-900">
                        {data.coordinates[0].toFixed(6)}°
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">About This Peak</h3>
                <div className="mt-2 rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">
                    {data.name} is a {data.mountain_type} standing at {data.elevation_m}{' '}
                    meters above sea level with a prominence of {data.prominence_m}{' '}
                    meters. This makes it a{' '}
                    {data.prominence_m > 300
                      ? 'significant peak'
                      : 'notable geographical feature'}{' '}
                    in the region, offering{' '}
                    {data.elevation_m > 2000
                      ? 'spectacular high-altitude'
                      : 'beautiful panoramic'}{' '}
                    views for those who reach its summit.
                  </p>
                </div>
              </div>

              {/* Climbing Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Climbing Information</h3>
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm font-medium text-gray-900">Recommended Season</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {data.elevation_m > 2500
                        ? 'Summer and early fall (July - September)'
                        : 'Spring through fall (April - October)'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm font-medium text-gray-900">Difficulty Level</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {data.elevation_m > 3000
                        ? 'Advanced - Requires mountaineering experience'
                        : data.elevation_m > 2000
                        ? 'Intermediate - Good fitness level required'
                        : 'Beginner to Intermediate - Accessible to most hikers'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 border-t border-gray-200/80 pt-6">
                <button className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3.5 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 transition-all duration-200">
                  Find Routes to Summit
                </button>
                <button className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  Get Directions
                </button>
                <button className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  Share
                </button>
              </div>
            </div>
          ) : data.type === 'campsite' ? (
            <div className="space-y-6">
              {/* Camper Profile Header Banner */}
              <div className="rounded-xl bg-gradient-to-br from-green-700 to-green-800 p-6 shadow-lg ring-1 ring-green-600/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">⛺ Camper Profile</h3>
                    <p className="text-sm text-green-100">Complete campsite details with amenities, ratings, and location information</p>
                  </div>
                  <div className="rounded-full bg-green-600/50 p-4">
                    <span className="text-4xl">⛺</span>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-5 shadow-sm ring-1 ring-green-200/50 hover:shadow-md transition-all duration-200">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Type</p>
                  <p className="mt-2 text-2xl font-bold capitalize text-green-900">
                    {data.campsite_type}
                  </p>
                </div>
                {data.rating && (
                  <div className="rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100/50 p-5 shadow-sm ring-1 ring-yellow-200/50 hover:shadow-md transition-all duration-200">
                    <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wider">Rating</p>
                    <div className="mt-2 flex items-center space-x-2">
                      <Star className="h-6 w-6 fill-yellow-500 text-yellow-500" />
                      <p className="text-3xl font-bold text-yellow-900">
                        {data.rating.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-sm ring-1 ring-blue-200/50 hover:shadow-md transition-all duration-200">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Location</p>
                  <p className="mt-2 text-sm font-bold text-blue-900">
                    {data.coordinates[0].toFixed(4)}, {data.coordinates[1].toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Photos Gallery */}
              {data.photos && data.photos.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <Camera className="w-5 h-5 mr-2 text-blue-600" />
                    Photos
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {data.photos.slice(0, 6).map((photo, index) => (
                      <div key={index} className="relative group cursor-pointer rounded-lg overflow-hidden aspect-square">
                        <Image
                          src={photo}
                          alt={`${data.name} - Photo ${index + 1}`}
                          fill
                          className="object-cover transition-all duration-500 group-hover:scale-110 group-hover:rotate-1"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Amenities */}
              {data.amenities && data.amenities.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Amenities</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.amenities.map((amenity, index) => (
                      <span
                        key={index}
                        className="rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-800 ring-1 ring-green-200/50 hover:bg-green-200 transition-colors duration-200"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Camper Profile Details */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">⛺ Camping Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 p-5 shadow-md ring-1 ring-green-200/50">
                    <p className="text-sm font-semibold text-green-700 mb-2">Site Type</p>
                    <p className="text-2xl font-bold text-green-900 mb-1 capitalize">{data.campsite_type}</p>
                    <p className="text-xs text-green-700">
                      {data.campsite_type === 'developed' ? 'Full facilities' : 
                       data.campsite_type === 'primitive' ? 'Basic setup' : 
                       'Backcountry camping'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 shadow-md ring-1 ring-blue-200/50">
                    <p className="text-sm font-semibold text-blue-700 mb-2">Accessibility</p>
                    <p className="text-2xl font-bold text-blue-900 mb-1">
                      {data.campsite_type === 'developed' ? 'Drive-In' : 
                       data.campsite_type === 'primitive' ? 'Hike-In' : 
                       'Remote'}
                    </p>
                    <p className="text-xs text-blue-700">
                      {data.campsite_type === 'developed' ? 'Vehicle access' : 
                       data.campsite_type === 'primitive' ? '1-5km hike' : 
                       'Remote location'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-orange-50 to-orange-100/50 p-5 shadow-md ring-1 ring-orange-200/50">
                    <p className="text-sm font-semibold text-orange-700 mb-2">Experience Level</p>
                    <p className="text-2xl font-bold text-orange-900 mb-1">
                      {data.campsite_type === 'developed' ? 'Beginner' : 
                       data.campsite_type === 'primitive' ? 'Intermediate' : 
                       'Advanced'}
                    </p>
                    <p className="text-xs text-orange-700">Recommended skill level</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 shadow-md ring-1 ring-purple-200/50">
                    <p className="text-sm font-semibold text-purple-700 mb-2">Best Season</p>
                    <p className="text-2xl font-bold text-purple-900 mb-1">
                      {data.campsite_type === 'developed' ? 'Year-Round' : 
                       data.campsite_type === 'primitive' ? 'Apr-Oct' : 
                       'Jun-Sep'}
                    </p>
                    <p className="text-xs text-purple-700">
                      {data.campsite_type === 'developed' ? 'All seasons' : 
                       data.campsite_type === 'primitive' ? 'Spring to fall' : 
                       'Summer only'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Gear Recommendations */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">🎒 Recommended Gear</h3>
                <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 shadow-md ring-1 ring-gray-200/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <span className="text-lg mr-2">🏕️</span>
                        Shelter
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• {data.campsite_type === 'developed' ? 'Tent or RV' : data.campsite_type === 'primitive' ? '3-season tent' : 'Lightweight backpacking tent'}</li>
                        <li>• Sleeping bag ({data.campsite_type === 'developed' ? 'comfort rated' : 'temperature rated'})</li>
                        <li>• Sleeping pad or mattress</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <span className="text-lg mr-2">🍳</span>
                        Cooking
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• {data.campsite_type === 'developed' ? 'Camp stove or grill' : 'Portable camp stove'}</li>
                        <li>• Cookware and utensils</li>
                        <li>• Food storage {data.campsite_type !== 'developed' && '(bear-proof)'}</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <span className="text-lg mr-2">💡</span>
                        Essentials
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Headlamp/flashlight</li>
                        <li>• First aid kit</li>
                        <li>• Water filtration</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <span className="text-lg mr-2">👕</span>
                        Clothing
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Layered clothing system</li>
                        <li>• Rain gear</li>
                        <li>• Sturdy footwear</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">About This Campsite</h3>
                <div className="mt-2 space-y-3">
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">{data.name}</span> is a{' '}
                      {data.campsite_type} located at coordinates{' '}
                      {data.coordinates[0].toFixed(4)}, {data.coordinates[1].toFixed(4)}.
                      {data.rating && ` This campsite has a rating of ${data.rating.toFixed(1)} stars.`}
                      {' '}Perfect for outdoor enthusiasts looking for a comfortable base to explore the surrounding trails and mountains.
                    </p>
                  </div>
                  
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="text-sm font-medium text-gray-900">Nearby Activities</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Hiking, mountain climbing, nature photography, stargazing, and wildlife observation
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 border-t border-gray-200/80 pt-6">
                <button className="flex-1 rounded-xl bg-gradient-to-r from-green-600 to-green-700 px-6 py-3.5 text-white font-semibold shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 hover:scale-105 transition-all duration-200">
                  Check Availability
                </button>
                <button className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  Get Directions
                </button>
                <button className="rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                  Share
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

