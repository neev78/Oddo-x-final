/**
 * RouteMate Premium Live Map & Tracking Controller
 */

// Application State
let map = null;
let currentBooking = null;
let activeBookingsList = [];
let routeCoordinates = []; // Array of L.LatLng representing the route path
let currentRouteIndex = 0;
let simulationInterval = null;
let simulationSpeed = 1; // Speed multiplier (1x, 2x, 5x, 10x)
let isPaused = false;
let totalTripDistance = 0; // Total distance of the route in meters

// Markers & Map Layers
let markers = {
    pickup: null,
    destination: null,
    car: null
};
let routePolyline = null;

// Landmark database for mock matching (Bangalore-based)
const LANDMARK_COORDINATES = {
    "sector 4": [12.9716, 77.5946],
    "sector 7": [12.9105, 77.6450],
    "office tower": [12.9716, 77.5946],
    "corp office": [12.9760, 77.5990],
    "downtown": [12.9279, 77.6271],
    "commuter hub": [12.9279, 77.6271],
    "tech park": [12.9562, 77.7011],
    "whitefield": [12.9562, 77.7011],
    "itpb": [12.9590, 77.7280],
    "airport": [13.1986, 77.7066],
    "terminal": [13.1986, 77.7066],
    "electronic city": [12.8399, 77.6770],
    "ecity": [12.8399, 77.6770],
    "indiranagar": [12.9784, 77.6408],
    "hsr": [12.9105, 77.6450],
    "hsr layout": [12.9105, 77.6450],
    "marathahalli": [12.9592, 77.6974],
    "jayanagar": [12.9299, 77.5824],
    "mg road": [12.9738, 77.6119],
    "jp nagar": [12.9105, 77.5857],
    "hebbal": [13.0358, 77.5970],
    "yeshwanthpur": [13.0238, 77.5529],
    "koramangala": [12.9352, 77.6244]
};

// Initialize Map on page load
document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setupEventListeners();
    fetchActiveBookings();
});

// Initialize Leaflet Map with CartoDB Dark Matter Theme
function initMap() {
    // Center initially around Bangalore
    map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    }).setView([12.9716, 77.5946], 12);

    // CartoDB Dark Matter tiles (premium look & feel matching dark/glassmorphic theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    console.log("Leaflet Live Map Initialized.");
}

// Bind UI actions
function setupEventListeners() {
    // Dropdown change listener
    document.getElementById("ride-selector").addEventListener("change", (e) => {
        const bookingId = e.target.value;
        if (bookingId) {
            loadRideTracking(bookingId);
        } else {
            resetMapState();
        }
    });

    // Speed Controls
    document.querySelectorAll(".speed-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            
            simulationSpeed = parseInt(e.target.dataset.speed) || 1;
            console.log(`Simulation speed changed to ${simulationSpeed}x`);
            
            // Restart interval with new speed if simulation is active and running
            if (simulationInterval && !isPaused) {
                stopSimulationTimer();
                startSimulationTimer();
            }
        });
    });

    // Pause/Resume Controls
    const toggleSimBtn = document.getElementById("toggle-sim-btn");
    toggleSimBtn.addEventListener("click", () => {
        if (isPaused) {
            resumeSimulation();
        } else {
            pauseSimulation();
        }
    });

    // Reset Simulation Control
    document.getElementById("reset-sim-btn").addEventListener("click", () => {
        restartSimulation();
    });
}

// Fetch active bookings from the Flask API
async function fetchActiveBookings() {
    try {
        const response = await fetch('/api/bookings/active');
        if (!response.ok) throw new Error("Could not retrieve bookings");
        
        const data = await response.json();
        activeBookingsList = data.bookings || [];
        
        const selector = document.getElementById("ride-selector");
        selector.innerHTML = "";
        
        if (activeBookingsList.length === 0) {
            selector.innerHTML = '<option value="">No active rides to track</option>';
            return;
        }
        
        // Populate select list
        selector.innerHTML = '<option value="">-- Choose a ride to track --</option>';
        activeBookingsList.forEach(booking => {
            const roleText = booking.role === 'driver' ? 'Driving' : 'Rider';
            const opt = document.createElement("option");
            opt.value = booking.id;
            opt.textContent = `[${roleText}] ${booking.pickup} ➔ ${booking.destination} (${booking.time})`;
            selector.appendChild(opt);
        });

        // Auto-select booking from URL parameter if present
        const urlParams = new URLSearchParams(window.location.search);
        const bookingId = urlParams.get('booking_id');
        if (bookingId) {
            const found = activeBookingsList.find(b => b.id === bookingId);
            if (found) {
                selector.value = bookingId;
                loadRideTracking(bookingId);
            } else {
                // If not found in active, try fetching details directly from individual endpoint
                fetchIndividualBooking(bookingId);
            }
        }
    } catch (error) {
        console.error("Error fetching active bookings:", error);
        document.getElementById("ride-selector").innerHTML = '<option value="">Error loading active rides</option>';
    }
}

// Fetch a single booking direct if not in list
async function fetchIndividualBooking(bookingId) {
    try {
        const selector = document.getElementById("ride-selector");
        selector.innerHTML = '<option value="">Loading ride details...</option>';
        
        const response = await fetch(`/api/booking/${bookingId}`);
        if (!response.ok) throw new Error("Ride details not found");
        
        const booking = await response.json();
        
        // Add to dropdown as an exception
        selector.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = booking.id;
        opt.textContent = `[Tracked] ${booking.pickup} ➔ ${booking.destination}`;
        selector.appendChild(opt);
        selector.value = booking.id;
        
        loadRideDetailsIntoUI(booking);
    } catch (e) {
        console.error("Error loading single booking:", e);
        fetchActiveBookings(); // Fallback to list
    }
}

// Load a specific booking for tracking
async function loadRideTracking(bookingId) {
    // Stop any existing simulation
    cleanupSimulation();

    // Show loading state in UI
    document.getElementById("no-ride-selected-placeholder").style.display = "none";
    document.getElementById("tracking-stats-panel").style.display = "block";
    document.getElementById("trip-status-text").innerText = "Loading Route Info...";
    
    try {
        const response = await fetch(`/api/booking/${bookingId}`);
        if (!response.ok) throw new Error("Could not load booking details");
        
        const booking = await response.json();
        currentBooking = booking;
        
        loadRideDetailsIntoUI(booking);
    } catch (error) {
        console.error("Error loading ride:", error);
        showModal('Error', 'Could not load booking information from the database.', 'error');
        resetMapState();
    }
}

// Populates stats, geocodes points, requests OSRM routes, builds polylines
async function loadRideDetailsIntoUI(booking) {
    // Populate details in sidebar text
    document.getElementById("stat-pickup-name").innerText = booking.pickup;
    document.getElementById("stat-dest-name").innerText = booking.destination;
    
    // Driver Details
    document.getElementById("driver-name-text").innerText = booking.driver;
    document.getElementById("vehicle-info-text").innerText = booking.vehicle || "Standard Sedan";
    
    // Initials Avatar
    const driverInitials = booking.driver.split('@')[0].slice(0, 2).toUpperCase();
    document.getElementById("driver-avatar-initials").innerText = driverInitials;
    
    document.getElementById("trip-status-text").innerText = "Locating coordinates...";

    // 1. Resolve coordinates for Pickup and Destination
    const pickupCoords = await resolveCoordinates(booking.pickup);
    const destCoords = await resolveCoordinates(booking.destination);
    
    console.log("Resolved pickup coords:", pickupCoords);
    console.log("Resolved destination coords:", destCoords);

    // 2. Fetch OSRM Road Route
    document.getElementById("trip-status-text").innerText = "Generating road path...";
    routeCoordinates = await fetchRoadRoute(pickupCoords, destCoords);
    
    // Calculate total distance
    totalTripDistance = 0;
    for (let i = 0; i < routeCoordinates.length - 1; i++) {
        totalTripDistance += routeCoordinates[i].distanceTo(routeCoordinates[i + 1]);
    }
    
    // 3. Clear existing map items
    clearMapLayers();

    // 4. Create custom Leaflet Icons
    const pickupIcon = L.divIcon({
        html: '<div style="background-color: var(--success); width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);"></div>',
        className: 'custom-pickup-marker',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });

    const destIcon = L.divIcon({
        html: '<div style="color: var(--danger); font-size: 24px; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5));"><i class="fa-solid fa-location-dot"></i></div>',
        className: 'custom-dest-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 24]
    });

    const carIcon = L.divIcon({
        html: `
            <div class="car-marker-container">
                <div class="car-marker-halo"></div>
                <div class="car-marker-icon-wrapper">
                    <i class="fa-solid fa-car-side" style="font-size: 14px;"></i>
                </div>
            </div>
        `,
        className: 'custom-car-marker',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
    });

    // 5. Draw Markers on Map
    markers.pickup = L.marker(pickupCoords, { icon: pickupIcon }).addTo(map)
        .bindPopup(`<b>Pickup Point</b><br>${booking.pickup}`);
        
    markers.destination = L.marker(destCoords, { icon: destIcon }).addTo(map)
        .bindPopup(`<b>Destination</b><br>${booking.destination}`);
        
    markers.car = L.marker(pickupCoords, { icon: carIcon }).addTo(map)
        .bindPopup(`<b>Driver Vehicle</b><br>${booking.vehicle || 'On route'}`);

    // 6. Draw Polyline Route
    routePolyline = L.polyline(routeCoordinates, {
        color: '#4f46e5', // Indigo primary
        weight: 5,
        opacity: 0.8,
        dashArray: '2, 6', // Dashed futuristic trace line
        lineJoin: 'round'
    }).addTo(map);

    // Zoom map bounds to include route with padding
    const bounds = L.latLngBounds([pickupCoords, destCoords]);
    map.fitBounds(bounds, { padding: [50, 50] });

    // 7. Start Simulation
    currentRouteIndex = 0;
    isPaused = false;
    document.getElementById("toggle-sim-btn").innerHTML = '<i class="fas fa-pause"></i> Pause Ride';
    document.getElementById("trip-status-text").innerText = "Driver En Route";
    
    startSimulationTimer();
}

// Landmark search -> Nominatim Geocoding -> Random Fallback
async function resolveCoordinates(locationName) {
    const nameLower = locationName.toLowerCase().trim();
    
    // Check local lookup DB first (instant & reliable)
    for (const key in LANDMARK_COORDINATES) {
        if (nameLower.includes(key)) {
            // Return coordinates with small random noise to prevent exact overlapping markers
            const coords = LANDMARK_COORDINATES[key];
            const noiseLat = (Math.random() - 0.5) * 0.003;
            const noiseLng = (Math.random() - 0.5) * 0.003;
            return [coords[0] + noiseLat, coords[1] + noiseLng];
        }
    }

    // Attempt Nominatim geocoding (OpenStreetMap free service)
    try {
        const queryUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(locationName)}+Bangalore`;
        const res = await fetch(queryUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'RouteMateCarpoolingDemo/1.0'
            }
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            }
        }
    } catch (e) {
        console.warn("OSM Nominatim Geocoder failed/timed out. Falling back to center.", e);
    }

    // Fallback coordinates: Center Bangalore with random offset
    console.log("No geocoding match. Creating mock coordinates near center.");
    const bangaloreCenter = [12.9716, 77.5946];
    const offsetLat = (Math.random() - 0.5) * 0.07; // limit offset to few kilometers
    const offsetLng = (Math.random() - 0.5) * 0.07;
    return [bangaloreCenter[0] + offsetLat, bangaloreCenter[1] + offsetLng];
}

// Queries OSRM road routes API, interpolates straight line on failure
async function fetchRoadRoute(start, end) {
    try {
        const queryUrl = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
        const res = await fetch(queryUrl);
        
        if (res.ok) {
            const data = await res.json();
            if (data && data.routes && data.routes.length > 0) {
                const geom = data.routes[0].geometry.coordinates;
                // Convert [lon, lat] from GeoJSON into Leaflet L.LatLng objects
                return geom.map(coord => L.latLng(coord[1], coord[0]));
            }
        }
    } catch (e) {
        console.warn("OSRM routing API failed. Falling back to straight line interpolation.", e);
    }

    // Fallback: Interpolate straight line coordinates between start and end
    const coords = [];
    const steps = 60; // 60 ticks for a smooth simulation
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = start[0] + t * (end[0] - start[0]);
        const lng = start[1] + t * (end[1] - start[1]);
        coords.push(L.latLng(lat, lng));
    }
    return coords;
}

// Starts the interval runner
function startSimulationTimer() {
    const tickRate = 1000 / simulationSpeed;
    simulationInterval = setInterval(simulationTick, tickRate);
}

// Stops the interval runner
function stopSimulationTimer() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

// Executed every tick: updates marker location, metrics, and progress bars
function simulationTick() {
    if (isPaused) return;

    currentRouteIndex++;
    
    // Check if reached destination
    if (currentRouteIndex >= routeCoordinates.length) {
        currentRouteIndex = routeCoordinates.length - 1;
        stopSimulationTimer();
        
        // Final updates
        markers.car.setLatLng(routeCoordinates[currentRouteIndex]);
        updateStatsPanel(100, 0, 0); // 100% progress, 0 distance, 0 speed
        
        document.getElementById("trip-status-text").innerText = "Arrived at Destination 🏁";
        document.getElementById("toggle-sim-btn").innerHTML = '<i class="fas fa-flag"></i> Complete';
        document.getElementById("toggle-sim-btn").disabled = true;
        
        showModal(
            'Arrived! 🏁',
            `You have safely reached your destination "${currentBooking.destination}". The driver will now request booking completion and wallet settlement.`,
            'success'
        );
        return;
    }

    const currentPos = routeCoordinates[currentRouteIndex];
    markers.car.setLatLng(currentPos);
    
    // Pan map to follow car if zoomed in close
    if (map.getZoom() > 14) {
        map.panTo(currentPos);
    }

    // Calculate metrics
    const progressPercent = Math.round((currentRouteIndex / (routeCoordinates.length - 1)) * 100);
    
    // Calculate remaining distance in meters
    let remainingDistance = 0;
    for (let i = currentRouteIndex; i < routeCoordinates.length - 1; i++) {
        remainingDistance += routeCoordinates[i].distanceTo(routeCoordinates[i + 1]);
    }
    
    // Simulate Speed with slight jitter (e.g. city speeds 35 - 55 km/h)
    const simulatedSpeed = Math.round(40 + Math.sin(currentRouteIndex * 0.5) * 12 + (Math.random() - 0.5) * 5);
    
    updateStatsPanel(progressPercent, remainingDistance, simulatedSpeed);
}

// Refreshes the DOM items in the sidebar dashboard
function updateStatsPanel(progressVal, distMeters, speedKmh) {
    // 1. Progress Bar & Percent text
    document.getElementById("progress-indicator-fill").style.width = `${progressVal}%`;
    document.getElementById("progress-percent-text").innerText = `${progressVal}%`;
    
    // 2. Distance remaining
    const distKm = (distMeters / 1000).toFixed(1);
    document.getElementById("metric-distance").innerText = `${distKm} km`;
    
    // 3. Current Speed
    document.getElementById("metric-speed").innerText = `${speedKmh} km/h`;
    
    // 4. ETA Calculation
    if (distMeters === 0) {
        document.getElementById("metric-eta").innerText = "Arrived";
    } else {
        // time = distance / speed
        const timeInHours = (distMeters / 1000) / (speedKmh || 40);
        const timeInMinutes = Math.max(1, Math.round(timeInHours * 60));
        
        // Add random traffic delay of 1-2 mins to look realistic
        const trafficDelay = (distMeters > 2000) ? 2 : 0;
        const totalMinutes = timeInMinutes + trafficDelay;
        
        document.getElementById("metric-eta").innerText = `${totalMinutes} min`;
    }
}

// Pause tracking simulation
function pauseSimulation() {
    isPaused = true;
    stopSimulationTimer();
    document.getElementById("toggle-sim-btn").innerHTML = '<i class="fas fa-play"></i> Resume Ride';
    document.getElementById("trip-status-text").innerText = "Ride Paused";
}

// Resume tracking simulation
function resumeSimulation() {
    isPaused = false;
    document.getElementById("toggle-sim-btn").innerHTML = '<i class="fas fa-pause"></i> Pause Ride';
    document.getElementById("trip-status-text").innerText = "Driver En Route";
    startSimulationTimer();
}

// Restart simulation from start point
function restartSimulation() {
    stopSimulationTimer();
    currentRouteIndex = 0;
    isPaused = false;
    
    document.getElementById("toggle-sim-btn").disabled = false;
    document.getElementById("toggle-sim-btn").innerHTML = '<i class="fas fa-pause"></i> Pause Ride';
    document.getElementById("trip-status-text").innerText = "Driver En Route";
    
    // Move car marker back to pickup location
    if (markers.car) {
        markers.car.setLatLng(routeCoordinates[0]);
    }
    
    // Reset stats
    updateStatsPanel(0, totalTripDistance, 45);
    
    // Fit bounds again
    if (markers.pickup && markers.destination) {
        const bounds = L.latLngBounds([markers.pickup.getLatLng(), markers.destination.getLatLng()]);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
    
    startSimulationTimer();
}

// Clear map layers
function clearMapLayers() {
    if (markers.pickup) map.removeLayer(markers.pickup);
    if (markers.destination) map.removeLayer(markers.destination);
    if (markers.car) map.removeLayer(markers.car);
    if (routePolyline) map.removeLayer(routePolyline);
    
    markers = { pickup: null, destination: null, car: null };
    routePolyline = null;
}

// Full cleanup
function cleanupSimulation() {
    stopSimulationTimer();
    clearMapLayers();
    currentBooking = null;
    routeCoordinates = [];
    currentRouteIndex = 0;
    totalTripDistance = 0;
}

// Reset page view back to initial state
function resetMapState() {
    cleanupSimulation();
    
    // Hide panel, show placeholder
    document.getElementById("tracking-stats-panel").style.display = "none";
    document.getElementById("no-ride-selected-placeholder").style.display = "flex";
    
    // Center map back to default
    map.setView([12.9716, 77.5946], 12);
}
