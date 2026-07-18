/**
 * RouteMate Premium Live Map & Tracking Controller
 * Supports real-time text chat and simulated VOIP calling.
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

// Communication Feature States
let chatPollingInterval = null;
let isChatOpen = false;
let localChatMessages = []; // Cache to store local simulator replies alongside db logs

// VOIP Calling Simulation States
let audioCtx = null;
let ringToneInterval = null;
let voipStatus = 'idle'; // 'idle', 'dialing', 'ringing', 'connecting', 'connected'
let voipDuration = 0;
let voipCallInterval = null;
let canvasFrameId = null;
let voipSettings = {
    mute: false,
    speaker: false
};

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

        // Parse actions from URL
        const urlParams = new URLSearchParams(window.location.search);
        const bookingId = urlParams.get('booking_id');
        const triggerAction = urlParams.get('action'); // 'chat' or 'call'
        
        if (bookingId) {
            const found = activeBookingsList.find(b => b.id === bookingId);
            if (found) {
                selector.value = bookingId;
                await loadRideTracking(bookingId);
                
                // Immediately trigger action if requested in URL
                if (triggerAction === 'chat') {
                    setTimeout(() => toggleChatDrawer(true), 800);
                } else if (triggerAction === 'call') {
                    setTimeout(() => startVoiceCall(), 800);
                }
            } else {
                await fetchIndividualBooking(bookingId, triggerAction);
            }
        }
    } catch (error) {
        console.error("Error fetching active bookings:", error);
        document.getElementById("ride-selector").innerHTML = '<option value="">Error loading active rides</option>';
    }
}

// Fetch a single booking direct if not in list
async function fetchIndividualBooking(bookingId, triggerAction = null) {
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
        
        await loadRideDetailsIntoUI(booking);
        
        // Trigger requested action
        if (triggerAction === 'chat') {
            setTimeout(() => toggleChatDrawer(true), 800);
        } else if (triggerAction === 'call') {
            setTimeout(() => startVoiceCall(), 800);
        }
    } catch (e) {
        console.error("Error loading single booking:", e);
        fetchActiveBookings(); // Fallback to list
    }
}

// Load a specific booking for tracking
async function loadRideTracking(bookingId) {
    // Stop any existing simulation and close panels
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
        
        await loadRideDetailsIntoUI(booking);
    } catch (error) {
        console.error("Error loading ride:", error);
        showModal('Error', 'Could not load booking information from the database.', 'error');
        resetMapState();
    }
}

// Populates stats, geocodes points, requests OSRM routes, builds polylines
async function loadRideDetailsIntoUI(booking) {
    // Map current booking reference
    currentBooking = booking;
    
    // Match matching role inside booking structure (rider vs driver)
    const matchInList = activeBookingsList.find(b => b.id === booking.id);
    currentBooking.role = matchInList ? matchInList.role : (booking.read_only ? 'shared' : 'rider');

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

    // Resolve owner actions vs guest shared actions
    const commActions = document.getElementById("driver-comm-actions");
    if (booking.read_only) {
        // Read only share view -> Hide chat and voice call options completely
        commActions.style.display = "none";
        console.log("Shared safety view: Call and Chat controls hidden.");
    } else {
        commActions.style.display = "flex";
        
        // Reset disabled states
        document.getElementById("chat-trigger-btn").removeAttribute("disabled");
        document.getElementById("call-trigger-btn").removeAttribute("disabled");
    }

    // 1. Resolve coordinates for Pickup and Destination
    const pickupCoords = await resolveCoordinates(booking.pickup);
    const destCoords = await resolveCoordinates(booking.destination);

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
    document.getElementById("toggle-sim-btn").removeAttribute("disabled");
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
    const offsetLat = (Math.random() - 0.5) * 0.07;
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
                return geom.map(coord => L.latLng(coord[1], coord[0]));
            }
        }
    } catch (e) {
        console.warn("OSRM routing API failed. Falling back to straight line interpolation.", e);
    }

    // Fallback: Interpolate straight line coordinates between start and end
    const coords = [];
    const steps = 60;
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
        updateStatsPanel(100, 0, 0);
        
        document.getElementById("trip-status-text").innerText = "Arrived at Destination 🏁";
        document.getElementById("toggle-sim-btn").innerHTML = '<i class="fas fa-flag"></i> Complete';
        document.getElementById("toggle-sim-btn").setAttribute("disabled", "true");
        
        // Block and lock calls once destination is reached
        lockCommunications();
        
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
    
    // Simulate Speed with slight jitter
    const simulatedSpeed = Math.round(40 + Math.sin(currentRouteIndex * 0.5) * 12 + (Math.random() - 0.5) * 5);
    
    updateStatsPanel(progressPercent, remainingDistance, simulatedSpeed);
}

// Refreshes the DOM items in the sidebar dashboard
function updateStatsPanel(progressVal, distMeters, speedKmh) {
    document.getElementById("progress-indicator-fill").style.width = `${progressVal}%`;
    document.getElementById("progress-percent-text").innerText = `${progressVal}%`;
    
    const distKm = (distMeters / 1000).toFixed(1);
    document.getElementById("metric-distance").innerText = `${distKm} km`;
    
    document.getElementById("metric-speed").innerText = `${speedKmh} km/h`;
    
    if (distMeters === 0) {
        document.getElementById("metric-eta").innerText = "Arrived";
    } else {
        const timeInHours = (distMeters / 1000) / (speedKmh || 40);
        const timeInMinutes = Math.max(1, Math.round(timeInHours * 60));
        
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
    
    // Unlock communications if previously locked on arrival
    unlockCommunications();

    document.getElementById("toggle-sim-btn").removeAttribute("disabled");
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

// Disable and hide Chat and Voice controls once ride has reached destination
function lockCommunications() {
    document.getElementById("chat-trigger-btn").setAttribute("disabled", "true");
    document.getElementById("call-trigger-btn").setAttribute("disabled", "true");
    
    // Terminate voice call if active
    if (voipStatus !== 'idle') {
        endVoiceCall();
    }
    
    // Close chat drawer
    if (isChatOpen) {
        toggleChatDrawer(false);
    }
}

function unlockCommunications() {
    if (currentBooking && !currentBooking.read_only) {
        document.getElementById("chat-trigger-btn").removeAttribute("disabled");
        document.getElementById("call-trigger-btn").removeAttribute("disabled");
    }
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
    cleanupChat();
    cleanupVoip();
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


/* ──────────────────────────────────────────────────────────────────────────
   TEXT CHAT SYSTEM
   ────────────────────────────────────────────────────────────────────────── */

// Toggles Chat Drawer visibility
function toggleChatDrawer(forceOpen = null) {
    if (currentBooking.read_only) return;
    
    const drawer = document.getElementById("chat-drawer");
    
    if (forceOpen === true || (!isChatOpen && forceOpen !== false)) {
        // Open
        isChatOpen = true;
        drawer.style.display = "flex";
        
        // Label recipient name
        const recipient = currentBooking.role === 'rider' ? currentBooking.driver : currentBooking.customer;
        document.getElementById("chat-recipient-name").innerText = recipient.split('@')[0];
        
        // Start polling logs
        localChatMessages = []; // Reset local simulations cache
        fetchChatMessages();
        chatPollingInterval = setInterval(fetchChatMessages, 2500);
        
        // Focus input
        setTimeout(() => document.getElementById("chat-input-field").focus(), 300);
    } else {
        // Close
        isChatOpen = false;
        drawer.style.display = "none";
        
        // Stop polling
        if (chatPollingInterval) {
            clearInterval(chatPollingInterval);
            chatPollingInterval = null;
        }
    }
}

// Fetch chat logs from backend
async function fetchChatMessages() {
    if (!currentBooking || !isChatOpen) return;
    
    try {
        const response = await fetch(`/api/chat/messages/${currentBooking.id}`);
        if (!response.ok) throw new Error("Could not retrieve messages");
        
        const data = await response.json();
        const dbMessages = data.messages || [];
        
        // Merge DB logs and cached local mockup replies
        const allMessages = [...dbMessages, ...localChatMessages];
        
        // Sort merged list by timestamp
        allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        renderMessages(allMessages);
    } catch (e) {
        console.error("Error loading chat:", e);
    }
}

// Render message list in container
function renderMessages(messages) {
    const container = document.getElementById("chat-messages-container");
    const activeUser = currentBooking.role === 'rider' ? currentBooking.customer : currentBooking.driver;
    
    // Keep track of scroll position to scroll only if user was already at the bottom
    const isAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 30;
    
    container.innerHTML = "";
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 40px; padding: 0 20px;">
                <i class="fa-regular fa-comments" style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;"></i>
                <p>No messages yet. Send a message to coordinate pickup details.</p>
            </div>
        `;
        return;
    }
    
    messages.forEach(msg => {
        const isSent = msg.sender === activeUser;
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${isSent ? 'sent' : 'received'}`;
        
        // Extract time
        let timeStr = "Sending...";
        if (msg.timestamp) {
            timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        bubble.innerHTML = `
            <span>${escapeHTML(msg.message)}</span>
            <span class="chat-meta">${timeStr}</span>
        `;
        
        container.appendChild(bubble);
    });
    
    if (isAtBottom || container.innerHTML !== "") {
        container.scrollTop = container.scrollHeight;
    }
}

// Sends a message to the backend
async function sendChatMessage() {
    const input = document.getElementById("chat-input-field");
    const text = input.value.trim();
    if (!text || !currentBooking) return;
    
    input.value = ""; // Clear input immediately
    
    try {
        const response = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                booking_id: currentBooking.id,
                message: text
            })
        });
        
        if (response.ok) {
            fetchChatMessages(); // Reload immediately
        } else {
            console.error("Message send failure");
        }
    } catch (e) {
        console.error("Error sending message:", e);
    }
}

// Keydown listener on chat input
function handleChatInputKey(e) {
    if (e.key === "Enter") {
        sendChatMessage();
    }
}

// Auto-Reply simulation for demo presentation
function simulateDriverReply() {
    if (!currentBooking) return;
    
    const driverReplies = [
        "I'm near your pickup point. See you in a minute!",
        "Yes, I'm heading your way now.",
        "Got it! I am waiting near the main security gate.",
        "Traffic is slightly heavy today, but I will be there in 3 minutes.",
        "Sure, see you soon!",
        "I've started the ride. Let me know when you spot the car."
    ];
    
    const riderReplies = [
        "Okay, I am standing near the main lobby entrance.",
        "Great, thanks! I am on my way down now.",
        "No problem, take your time.",
        "I'll be there in 2 minutes, just packing my bag.",
        "I see your car! Approaching now.",
        "Understood, see you shortly."
    ];
    
    const pool = currentBooking.role === 'rider' ? driverReplies : riderReplies;
    const randomMsg = pool[Math.floor(Math.random() * pool.length)];
    const senderEmail = currentBooking.role === 'rider' ? currentBooking.driver : currentBooking.customer;
    
    // Add locally to cache (since we cannot log in as the other user in a single-agent demo)
    localChatMessages.push({
        id: "mock_" + Date.now(),
        sender: senderEmail,
        message: randomMsg,
        timestamp: new Date().toISOString()
    });
    
    // Force UI refresh
    fetchChatMessages();
}

function cleanupChat() {
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
    isChatOpen = false;
    document.getElementById("chat-drawer").style.display = "none";
    localChatMessages = [];
}

// Utility to escape HTML
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}


/* ──────────────────────────────────────────────────────────────────────────
   VOIP CALLING SIMULATOR
   ────────────────────────────────────────────────────────────────────────── */

// Starts simulated voice call overlay
function startVoiceCall() {
    // 1. Verify call access criteria (active ride window)
    if (!currentBooking || currentBooking.read_only) return;
    
    if (currentRouteIndex >= routeCoordinates.length - 1) {
        showModal(
            'Call Unavailable ⚠️',
            'Calls are only accessible during the ride. You have already reached the destination.',
            'info'
        );
        return;
    }
    
    cleanupVoip(); // Reset
    
    // 2. Open full-screen call screen
    const overlay = document.getElementById("voip-call-overlay");
    overlay.style.display = "flex";
    
    // 3. Set display caller details
    const recipient = currentBooking.role === 'rider' ? currentBooking.driver : currentBooking.customer;
    const recipientName = recipient.split('@')[0];
    document.getElementById("voip-caller-name").innerText = recipientName;
    document.getElementById("voip-caller-avatar").innerText = recipientName.slice(0, 2).toUpperCase();
    
    // 4. Dialing sequence
    voipStatus = 'dialing';
    document.getElementById("voip-call-status").innerText = "Dialing...";
    
    // Generate beeps
    playCallTones('dialing');
    
    // Ringing transition
    setTimeout(() => {
        if (voipStatus !== 'dialing') return;
        voipStatus = 'ringing';
        document.getElementById("voip-call-status").innerText = "Ringing...";
        playCallTones('ringing');
    }, 1800);
    
    // Connecting transition
    setTimeout(() => {
        if (voipStatus !== 'ringing') return;
        voipStatus = 'connecting';
        document.getElementById("voip-call-status").innerText = "Connecting...";
        stopTones();
    }, 4500);
    
    // Connected session
    setTimeout(() => {
        if (voipStatus !== 'connecting') return;
        voipStatus = 'connected';
        stopTones();
        
        // Start duration counter
        voipDuration = 0;
        document.getElementById("voip-call-status").innerText = "Connected - 00:00";
        voipCallInterval = setInterval(updateCallDuration, 1000);
        
        // Start canvas waves
        startVoipVisualizer();
    }, 5800);
}

// Generates ringing and dialing sounds via Web Audio API
function playCallTones(type) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        if (type === 'dialing') {
            // Low dialing sound: 350Hz+440Hz beep for 0.5 seconds every 2 seconds
            const playDialBeep = () => {
                if (voipStatus !== 'dialing') return;
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc1.frequency.value = 350;
                osc2.frequency.value = 440;
                gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
                
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc1.start();
                osc2.start();
                osc1.stop(audioCtx.currentTime + 0.5);
                osc2.stop(audioCtx.currentTime + 0.5);
            };
            playDialBeep();
            ringToneInterval = setInterval(playDialBeep, 2000);
        } 
        else if (type === 'ringing') {
            // Standard telephone ringback: 400Hz+450Hz played for 1.5 seconds every 4.5 seconds
            const playRingback = () => {
                if (voipStatus !== 'ringing') return;
                const osc1 = audioCtx.createOscillator();
                const osc2 = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc1.frequency.value = 400;
                osc2.frequency.value = 450;
                gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.04, audioCtx.currentTime + 1.5);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.6);
                
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc1.start();
                osc2.start();
                osc1.stop(audioCtx.currentTime + 1.6);
                osc2.stop(audioCtx.currentTime + 1.6);
            };
            playRingback();
            ringToneInterval = setInterval(playRingback, 4500);
        }
    } catch (err) {
        console.warn("Web Audio API not supported/blocked by browser.", err);
    }
}

// Stop AudioContext tones
function stopTones() {
    if (ringToneInterval) {
        clearInterval(ringToneInterval);
        ringToneInterval = null;
    }
}

// Increments timer ticks
function updateCallDuration() {
    voipDuration++;
    const mins = String(Math.floor(voipDuration / 60)).padStart(2, '0');
    const secs = String(voipDuration % 60).padStart(2, '0');
    document.getElementById("voip-call-status").innerText = `Connected - ${mins}:${secs}`;
}

// Draws glowing moving waves on canvas representing mic active waves
function startVoipVisualizer() {
    const canvas = document.getElementById("voip-canvas");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    
    // Set explicit size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    let phase = 0;
    
    const drawWave = () => {
        if (voipStatus !== 'connected') {
            canvasFrameId = null;
            return;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (voipSettings.mute) {
            // Muted -> Straight flat line
            ctx.beginPath();
            ctx.moveTo(0, canvas.height / 2);
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            ctx.lineWidth = 2;
            ctx.stroke();
            canvasFrameId = requestAnimationFrame(drawWave);
            return;
        }
        
        // Active mic wave: 3 sine layers with varying offsets & frequencies
        const colors = ["rgba(14, 165, 233, 0.4)", "rgba(79, 70, 229, 0.3)", "rgba(16, 185, 129, 0.2)"];
        const modulators = [
            { freq: 0.05, amp: 20, speed: 0.1 },
            { freq: 0.08, amp: 12, speed: 0.15 },
            { freq: 0.03, amp: 25, speed: 0.08 }
        ];
        
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = i === 0 ? 3 : 1.5;
            
            const mod = modulators[i];
            
            for (let x = 0; x < canvas.width; x++) {
                const jitter = Math.sin(phase * 2.5 + x * 0.1) * 1.5;
                const y = canvas.height / 2 + Math.sin(x * mod.freq + phase * mod.speed) * mod.amp + jitter;
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        phase += 0.8;
        canvasFrameId = requestAnimationFrame(drawWave);
    };
    
    drawWave();
}

// End voice call
function endVoiceCall() {
    cleanupVoip();
    document.getElementById("voip-call-overlay").style.display = "none";
}

// Mute microphone
function toggleVoipMute() {
    voipSettings.mute = !voipSettings.mute;
    const btn = document.getElementById("voip-btn-mute");
    if (voipSettings.mute) {
        btn.classList.add("active");
    } else {
        btn.classList.remove("active");
    }
}

// Toggle Speaker volume
function toggleVoipSpeaker() {
    voipSettings.speaker = !voipSettings.speaker;
    const btn = document.getElementById("voip-btn-speaker");
    if (voipSettings.speaker) {
        btn.classList.add("active");
    } else {
        btn.classList.remove("active");
    }
}

// Stop calling loops
function cleanupVoip() {
    stopTones();
    if (voipCallInterval) {
        clearInterval(voipCallInterval);
        voipCallInterval = null;
    }
    if (canvasFrameId) {
        cancelAnimationFrame(canvasFrameId);
        canvasFrameId = null;
    }
    voipStatus = 'idle';
    voipDuration = 0;
    voipSettings = { mute: false, speaker: false };
    
    // Reset buttons
    const muteBtn = document.getElementById("voip-btn-mute");
    const speakerBtn = document.getElementById("voip-btn-speaker");
    if (muteBtn) muteBtn.classList.remove("active");
    if (speakerBtn) speakerBtn.classList.remove("active");
}
