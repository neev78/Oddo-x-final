// RouteMate Wallet — Interactive Client Script

let currentMethod = 'UPI';
let pollingInterval = null;
let qrCodeInstance = null;

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    fetchBalance();
    fetchTransactions();
    fetchPendingPayments();

    // Start live polling every 3 seconds
    pollingInterval = setInterval(() => {
        fetchBalance();
        fetchPendingPayments();
    }, 3000);
});

// ─────────────────────────────────────────────
// Balance Fetching (Live Polling)
// ─────────────────────────────────────────────
async function fetchBalance() {
    try {
        const res = await fetch('/api/wallet/balance');
        const data = await res.json();

        if (data.error) {
            document.getElementById('wallet-balance-value').textContent = '0';
            return;
        }

        const balanceEl = document.getElementById('wallet-balance-value');
        const oldValue = parseFloat(balanceEl.textContent.replace(/,/g, '')) || 0;
        const newValue = data.balance;

        balanceEl.textContent = formatNumber(newValue);
        document.getElementById('wallet-user-name').textContent = data.name;

        // Flash animation when balance changes
        if (oldValue !== newValue && oldValue !== 0) {
            balanceEl.classList.add('balance-flash');
            setTimeout(() => balanceEl.classList.remove('balance-flash'), 600);
        }

        document.getElementById('sync-status').textContent = 'Live';
        document.getElementById('sync-icon').style.display = 'none';
    } catch (err) {
        document.getElementById('sync-status').textContent = 'Offline';
    }
}

function formatNumber(num) {
    return num.toLocaleString('en-IN');
}

// ─────────────────────────────────────────────
// Quick Amount Chips
// ─────────────────────────────────────────────
function setAmount(amount) {
    document.getElementById('recharge-amount').value = amount;

    // Highlight selected chip
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    event.target.classList.add('selected');
}

// ─────────────────────────────────────────────
// Payment Method Selector
// ─────────────────────────────────────────────
function selectMethod(method) {
    currentMethod = method;

    document.getElementById('tab-upi').classList.toggle('active', method === 'UPI');
    document.getElementById('tab-qr').classList.toggle('active', method === 'QR');
    document.getElementById('upi-section').style.display = method === 'UPI' ? 'block' : 'none';
    document.getElementById('qr-section').style.display = method === 'QR' ? 'block' : 'none';

    // Generate QR if switching to QR tab
    if (method === 'QR') {
        generateQRCode();
    }
}

// ─────────────────────────────────────────────
// QR Code Generation
// ─────────────────────────────────────────────
function generateQRCode() {
    const amount = document.getElementById('recharge-amount').value || '0';
    const reference = `ROUTEMATE-RECHARGE-${Date.now()}-INR${amount}`;

    const container = document.getElementById('qr-code-container');
    container.innerHTML = '';

    // Check if QRCode library is loaded
    if (typeof QRCode === 'undefined') {
        container.innerHTML = '<p style="color: var(--text-muted);">QR library loading...</p>';
        return;
    }

    qrCodeInstance = new QRCode(container, {
        text: reference,
        width: 180,
        height: 180,
        colorDark: '#1e1b4b',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
}

// ─────────────────────────────────────────────
// Process Recharge
// ─────────────────────────────────────────────
async function processRecharge() {
    const amountInput = document.getElementById('recharge-amount');
    const amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) {
        showModal('Invalid Amount', 'Please enter a valid recharge amount greater than ₹0.', 'error');
        return;
    }

    if (amount > 10000) {
        showModal('Limit Exceeded', 'Maximum recharge amount is ₹10,000.', 'error');
        return;
    }

    if (currentMethod === 'UPI') {
        const upiId = document.getElementById('upi-id').value.trim();
        if (!upiId || !upiId.includes('@')) {
            showModal('Invalid UPI ID', 'Please enter a valid UPI ID (e.g. yourname@bank).', 'error');
            return;
        }
    }

    // Show processing overlay
    const processingEl = document.getElementById('recharge-processing');
    const processingText = document.getElementById('processing-text');
    processingEl.style.display = 'flex';

    if (currentMethod === 'UPI') {
        processingText.textContent = 'Verifying UPI payment...';
    } else {
        processingText.textContent = 'Confirming QR payment...';
    }

    // Simulated delay (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));

    processingText.textContent = 'Processing transaction...';

    try {
        const res = await fetch('/api/wallet/recharge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount, method: currentMethod })
        });

        const data = await res.json();
        processingEl.style.display = 'none';

        if (data.success) {
            showModal(
                'Recharge Successful! 🎉',
                `₹${formatNumber(amount)} has been added to your wallet via ${currentMethod}. Your new balance is ₹${formatNumber(data.newBalance)}.`,
                'success'
            );
            amountInput.value = '';
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
            if (currentMethod === 'UPI') {
                document.getElementById('upi-id').value = '';
            }
            fetchBalance();
            fetchTransactions();
        } else {
            showModal('Recharge Failed', data.error || 'Something went wrong. Please try again.', 'error');
        }
    } catch (err) {
        processingEl.style.display = 'none';
        showModal('Network Error', 'Could not connect to the server. Please check your connection.', 'error');
    }
}

// ─────────────────────────────────────────────
// Fetch Transactions
// ─────────────────────────────────────────────
async function fetchTransactions() {
    const listEl = document.getElementById('transactions-list');

    try {
        const res = await fetch('/api/wallet/transactions');
        const data = await res.json();

        if (data.error) {
            listEl.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Could not load transactions.</p>';
            return;
        }

        const txns = data.transactions;

        if (!txns || txns.length === 0) {
            listEl.innerHTML = `
                <div class="transactions-empty">
                    <i class="fas fa-receipt" style="font-size: 40px; opacity: 0.3; margin-bottom: 12px;"></i>
                    <h4>No Transactions Yet</h4>
                    <p>Your wallet transaction history will appear here.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = txns.map((txn, index) => {
            let icon, label, amountClass, sign;

            switch (txn.type) {
                case 'recharge':
                    icon = 'fa-arrow-down';
                    label = `Wallet Recharge via ${txn.method}`;
                    amountClass = 'amount-positive';
                    sign = '+';
                    break;
                case 'ride_payment_sent':
                    icon = 'fa-arrow-up';
                    label = `Ride Payment Sent`;
                    amountClass = 'amount-negative';
                    sign = '-';
                    break;
                case 'ride_payment_received':
                    icon = 'fa-arrow-down';
                    label = `Ride Payment Received`;
                    amountClass = 'amount-positive';
                    sign = '+';
                    break;
                default:
                    icon = 'fa-circle';
                    label = txn.type;
                    amountClass = '';
                    sign = '';
            }

            const timestamp = txn.timestamp ? formatTimestamp(txn.timestamp) : 'Just now';

            return `
                <div class="transaction-item animate-fade" style="animation-delay: ${index * 0.05}s;">
                    <div class="txn-icon-wrapper ${txn.type === 'ride_payment_sent' ? 'txn-debit' : 'txn-credit'}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="txn-details">
                        <div class="txn-label">${label}</div>
                        <div class="txn-time">${timestamp}</div>
                    </div>
                    <div class="txn-amount ${amountClass}">
                        ${sign}₹${formatNumber(txn.amount)}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--danger); padding: 20px;">Error loading transactions.</p>';
    }
}

function formatTimestamp(isoString) {
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return 'Unknown';
    }
}

// ─────────────────────────────────────────────
// Pending Payments
// ─────────────────────────────────────────────
async function fetchPendingPayments() {
    try {
        const res = await fetch('/api/wallet/pending-payments');
        const data = await res.json();
        const section = document.getElementById('pending-payments-section');

        if (!data.pending || data.pending.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        section.innerHTML = data.pending.map(booking => `
            <div class="payment-due-banner animate-fade">
                <div class="banner-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="banner-content">
                    <h4>Payment Due for Ride</h4>
                    <p class="banner-route">
                        <i class="fas fa-circle-dot" style="color: var(--accent); font-size: 10px;"></i> ${booking.pickup}
                        <i class="fas fa-arrow-right" style="margin: 0 6px; font-size: 10px;"></i>
                        <i class="fas fa-location-dot" style="color: var(--danger); font-size: 10px;"></i> ${booking.destination}
                    </p>
                    <div class="banner-details">
                        <span><i class="fas fa-calendar"></i> ${booking.date}</span>
                        <span><i class="fas fa-clock"></i> ${booking.time}</span>
                        <span><i class="fas fa-user-tie"></i> ${booking.driver}</span>
                    </div>
                </div>
                <div class="banner-fare">
                    <div class="fare-amount">₹${booking.price}</div>
                    <div class="banner-pay-actions">
                        <button class="pay-now-btn" onclick="payForRide('${booking.id}', ${booking.price}, 'UPI')">
                            <i class="fas fa-mobile-screen-button"></i> Pay UPI
                        </button>
                        <button class="pay-now-btn pay-qr" onclick="payForRide('${booking.id}', ${booking.price}, 'QR')">
                            <i class="fas fa-qrcode"></i> Pay QR
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        // Silently fail — will retry on next poll
    }
}

// ─────────────────────────────────────────────
// Pay for Ride
// ─────────────────────────────────────────────
async function payForRide(bookingId, fare, method) {
    // Check balance first
    try {
        const balRes = await fetch('/api/wallet/balance');
        const balData = await balRes.json();

        if (balData.balance < fare) {
            const deficit = fare - balData.balance;
            showModal(
                'Insufficient Balance ⚠️',
                `Your wallet balance is ₹${formatNumber(balData.balance)} but the fare is ₹${formatNumber(fare)}. Please recharge ₹${formatNumber(deficit)} more to complete this payment.`,
                'error'
            );
            return;
        }
    } catch {
        showModal('Error', 'Could not verify wallet balance. Please try again.', 'error');
        return;
    }

    // Show confirmation
    const btn = event.target.closest('button');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
    btn.disabled = true;

    // Simulated delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        const res = await fetch('/api/wallet/pay-ride', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking_id: bookingId, method: method })
        });

        const data = await res.json();

        if (data.success) {
            showModal(
                'Payment Successful! ✅',
                `₹${formatNumber(fare)} has been paid to the driver. Your new balance is ₹${formatNumber(data.newBalance)}.`,
                'success'
            );
            fetchBalance();
            fetchTransactions();
            fetchPendingPayments();
        } else {
            showModal('Payment Failed', data.error || 'Could not process payment.', 'error');
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    } catch (err) {
        showModal('Network Error', 'Could not connect to the server.', 'error');
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}
