// RouteMate Interactive Client Script

document.addEventListener('DOMContentLoaded', () => {
    console.log("RouteMate Premium UI Initialized");
    
    // Inject Custom Modal HTML if it doesn't exist
    if (!document.getElementById('custom-alert-modal')) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'custom-alert-modal';
        modalDiv.className = 'custom-modal';
        modalDiv.innerHTML = `
            <div class="custom-modal-content glass-panel">
                <div id="modal-icon-container" class="modal-icon success">
                    <i id="modal-icon" class="fas fa-check"></i>
                </div>
                <h3 id="modal-title" class="modal-title">Success</h3>
                <p id="modal-desc" class="modal-desc">Action completed successfully.</p>
                <button id="modal-close-btn" class="primary-btn modal-close-btn">Dismiss</button>
            </div>
        `;
        document.body.appendChild(modalDiv);
        
        // Setup Modal Close Event
        document.getElementById('modal-close-btn').addEventListener('click', hideModal);
        modalDiv.addEventListener('click', (e) => {
            if (e.target === modalDiv) hideModal();
        });
    }
});

// Custom Modal Controllers
function showModal(title, description, type = 'success') {
    const modal = document.getElementById('custom-alert-modal');
    if (!modal) return;
    
    const titleEl = document.getElementById('modal-title');
    const descEl = document.getElementById('modal-desc');
    const iconContainer = document.getElementById('modal-icon-container');
    const icon = document.getElementById('modal-icon');
    
    titleEl.innerText = title;
    descEl.innerText = description;
    
    // Setup type classes
    iconContainer.className = 'modal-icon ' + type;
    if (type === 'success') {
        icon.className = 'fas fa-check';
    } else if (type === 'info') {
        icon.className = 'fas fa-info';
    } else if (type === 'danger' || type === 'error') {
        iconContainer.className = 'modal-icon danger';
        icon.className = 'fas fa-exclamation-triangle';
    }
    
    modal.classList.add('show');
}

function hideModal() {
    const modal = document.getElementById('custom-alert-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Seat Booking Flow (Mocked for front-end visual feedback)
function bookRide(rideId, pickup, destination) {
    showModal(
        'Seat Requested!', 
        `Your booking request for the ride from "${pickup}" to "${destination}" has been sent to the driver. You will receive an SMS confirmation once approved.`, 
        'success'
    );
}

// Emergency SOS Activation Flow
let sosActive = false;
function triggerSOS() {
    const btn = document.getElementById('sos-btn');
    const textStatus = document.getElementById('sos-text-status');
    const trackerContainer = document.getElementById('sos-tracker');
    
    if (!btn) return;
    
    sosActive = !sosActive;
    
    if (sosActive) {
        btn.classList.add('active');
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i><span>CANCEL</span>`;
        textStatus.innerText = "🚨 Emergency Broadcast Active: HR Team & Authorities Alerted";
        textStatus.className = "sos-status alerted";
        
        if (trackerContainer) {
            trackerContainer.style.display = "block";
            trackerContainer.innerHTML = `
                <div class="glass-panel" style="padding: 20px; border-radius: 12px; margin-top: 20px; text-align: left; animation: fadeIn 0.3s ease-out;">
                    <h4 style="margin-bottom: 8px;"><i class="fas fa-satellite-dish" style="color: var(--danger); margin-right: 8px;"></i> Live GPS Location Broadcast</h4>
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Sharing location with security dispatch...</p>
                    <div style="height: 10px; background-color: var(--border-color); border-radius: 5px; overflow: hidden; position: relative;">
                        <div style="height: 100%; background: linear-gradient(90deg, var(--danger), var(--warning)); width: 75%; border-radius: 5px; animation: pulseSOS 1.5s infinite;"></div>
                    </div>
                </div>
            `;
        }
        
        showModal(
            'SOS Transmitted!',
            'Emergency services, corporate security, and your pre-configured contacts have been notified of your location. Keep this page open.',
            'danger'
        );
    } else {
        btn.classList.remove('active');
        btn.innerHTML = `<i class="fas fa-hand-holding-hand"></i><span>TRIGGER SOS</span>`;
        textStatus.innerText = "Status: Secure & Monitoring Commute";
        textStatus.className = "sos-status safe";
        
        if (trackerContainer) {
            trackerContainer.style.display = "none";
        }
        
        showModal(
            'SOS Cancelled',
            'Your emergency alarm has been deactivated.',
            'info'
        );
    }
}

// Commute Buddy Matching Simulator
function matchBuddies(event) {
    if (event) event.preventDefault();
    
    const resultsContainer = document.getElementById('buddy-matches-list');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: var(--primary);"></i>
            <p style="margin-top: 10px; color: var(--text-muted);">Finding matching commuters on your route...</p>
        </div>
    `;
    
    setTimeout(() => {
        resultsContainer.innerHTML = `
            <div class="buddy-item animate-fade">
                <div class="buddy-avatar">JD</div>
                <div class="buddy-info">
                    <div class="buddy-name">Jane Doe (Engineering)</div>
                    <div class="buddy-meta">
                        <span><i class="fas fa-location-arrow"></i> 0.5 km away</span>
                        <span><i class="fas fa-clock"></i> 9:00 AM &bull; 6:00 PM</span>
                    </div>
                </div>
                <button class="connect-btn" onclick="connectBuddy('Jane Doe')">Connect</button>
            </div>
            
            <div class="buddy-item animate-fade" style="animation-delay: 0.1s;">
                <div class="buddy-avatar">AM</div>
                <div class="buddy-info">
                    <div class="buddy-name">Alex Miller (Product)</div>
                    <div class="buddy-meta">
                        <span><i class="fas fa-location-arrow"></i> 1.2 km away</span>
                        <span><i class="fas fa-clock"></i> 8:30 AM &bull; 5:30 PM</span>
                    </div>
                </div>
                <button class="connect-btn" onclick="connectBuddy('Alex Miller')">Connect</button>
            </div>

            <div class="buddy-item animate-fade" style="animation-delay: 0.2s;">
                <div class="buddy-avatar">SR</div>
                <div class="buddy-info">
                    <div class="buddy-name">Sarah Roy (HR Operations)</div>
                    <div class="buddy-meta">
                        <span><i class="fas fa-location-arrow"></i> 2.1 km away</span>
                        <span><i class="fas fa-clock"></i> 9:15 AM &bull; 6:15 PM</span>
                    </div>
                </div>
                <button class="connect-btn" onclick="connectBuddy('Sarah Roy')">Connect</button>
            </div>
        `;
    }, 1200);
}

function connectBuddy(name) {
    showModal(
        'Connection Requested!',
        `A request to connect and commute together has been sent to ${name}. We will notify you when they accept.`,
        'success'
    );
}

// Local filtration for Rides list
function filterRides() {
    const pickupVal = document.getElementById('search-pickup').value.toLowerCase();
    const destVal = document.getElementById('search-destination').value.toLowerCase();
    const rideCards = document.querySelectorAll('.ride-card');
    let matchedCount = 0;
    
    rideCards.forEach(card => {
        const pickupText = card.querySelector('.ride-pickup-text').innerText.toLowerCase();
        const destText = card.querySelector('.ride-dest-text').innerText.toLowerCase();
        
        if (pickupText.includes(pickupVal) && destText.includes(destVal)) {
            card.style.display = 'flex';
            matchedCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    const noRidesEl = document.getElementById('no-rides-element');
    if (noRidesEl) {
        if (matchedCount === 0) {
            noRidesEl.style.display = 'block';
        } else {
            noRidesEl.style.display = 'none';
        }
    }
}

// ─────────────────────────────────────────────
// Global Ride Payment Prompt (Forces payment when driver ends ride)
// ─────────────────────────────────────────────
let hasShownPaymentModal = false;

async function checkPendingPaymentsGlobally() {
    try {
        const res = await fetch('/api/wallet/pending-payments');
        if (!res.ok) return; 
        const data = await res.json();
        
        if (data.pending && data.pending.length > 0 && !hasShownPaymentModal) {
            hasShownPaymentModal = true;
            const booking = data.pending[0];
            
            showModal('Ride Ended', '', 'info');
            
            const modalContent = `
                <div style="text-align: left; margin-top: 15px;">
                    <p style="margin-bottom: 10px; color: var(--text-main);">Your ride from <strong>${booking.pickup}</strong> to <strong>${booking.destination}</strong> has ended.</p>
                    <p style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: var(--text-main);">Fare to pay: ₹${booking.price}</p>
                    <button class="primary-btn" style="width: 100%; margin-bottom: 10px;" onclick="processGlobalPayment('${booking.id}', ${booking.price}, this)">
                        <i class="fas fa-wallet"></i> Pay ₹${booking.price} from Wallet
                    </button>
                </div>
            `;
            
            // Inject custom HTML and hide the dismiss button so they are forced to act
            document.getElementById('modal-desc').innerHTML = modalContent;
            document.getElementById('modal-close-btn').style.display = 'none';
        }
    } catch (e) {
        // fail silently
    }
}

async function processGlobalPayment(bookingId, price, btn) {
    try {
        // 1. Verify balance first
        const balRes = await fetch('/api/wallet/balance');
        const balData = await balRes.json();

        if (balData.error) {
            alert('Could not retrieve your wallet balance.');
            return;
        }

        const balance = parseFloat(balData.balance) || 0;
        const fare = parseFloat(price) || 0;

        // Warning message if balance is not enough
        if (balance < fare) {
            const deficit = fare - balance;
            alert(`Insufficient Balance ⚠️\n\nYou need ₹${deficit} more to pay for this ride. (Current Balance: ₹${balance}, Fare: ₹${fare}).\n\nRedirecting to wallet to recharge...`);
            window.location.href = '/wallet';
            return;
        }

        // 2. Process payment
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        btn.disabled = true;

        const res = await fetch('/api/wallet/pay-ride', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, method: 'Wallet' })
        });

        const data = await res.json();

        if (data.success) {
            document.getElementById('modal-title').innerText = 'Payment Successful! ✅';
            document.getElementById('modal-desc').innerHTML = `<p style="margin-top: 15px; color: var(--text-main);">₹${fare} has been paid. Your new balance is ₹${data.newBalance}.</p>`;
            document.getElementById('modal-close-btn').style.display = 'block'; // Allow dismiss
            document.getElementById('modal-icon-container').className = 'modal-icon success';
            document.getElementById('modal-icon').className = 'fas fa-check';
            
            // Reload page after a delay to clear the banner
            setTimeout(() => window.location.reload(), 2000);
        } else {
            alert('Payment Failed: ' + (data.error || 'Unknown error'));
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }

    } catch (err) {
        alert('An error occurred during payment. Please try again.');
        btn.disabled = false;
    }
}

// Start polling for pending payments every 3 seconds if we are not on login/landing page
if (window.location.pathname !== '/login' && window.location.pathname !== '/' && window.location.pathname !== '/register') {
    setInterval(checkPendingPaymentsGlobally, 3000);
    setTimeout(checkPendingPaymentsGlobally, 1000); 
}