
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const { compressBuffer } = require('./imageCompressor');

const RECEIPTS_DIR = path.join(__dirname, '..', 'generated_receipts');
const LOGOS_DIR = path.join(__dirname, '..', 'logos');

if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}

const BANKS = [
  'HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank',
  'Kotak Mahindra Bank', 'Punjab National Bank', 'Bank of Baroda',
  'Canara Bank', 'Union Bank of India', 'IndusInd Bank'
];

const logoCache = {};

async function getLogoImage(filename) {
  if (logoCache[filename] !== undefined) {
    return logoCache[filename];
  }

  const logoPath = path.join(LOGOS_DIR, filename);
  if (fs.existsSync(logoPath)) {
    try {
      const img = await loadImage(logoPath);
      logoCache[filename] = img;
      console.log(`[RECEIPT] Loaded custom logo: logos/${filename}`);
      return img;
    } catch (err) {
      console.log(`[RECEIPT] Failed to parse custom logo logos/${filename}:`, err.message);
      logoCache[filename] = null;
      return null;
    }
  } else {
    logoCache[filename] = null;
    return null;
  }
}

function formatDate(date, format = 'short') {
  if (format === 'long') {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(date, includeSeconds = true) {
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPhoneStatusBar(ctx, width, isDark = false) {
  ctx.save();
  ctx.fillStyle = isDark ? '#FFFFFF' : '#333333';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'left';

  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;
  ctx.fillText(timeStr, 24, 24);

  const rightX = width - 24;
  ctx.textAlign = 'right';

  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(rightX - 24, 14, 20, 10);

  ctx.fillStyle = isDark ? '#22C55E' : '#16A34A';
  ctx.fillRect(rightX - 22, 16, 13, 6);

  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)';
  ctx.fillRect(rightX - 4, 17, 1.5, 4);

  const wifiX = rightX - 34;
  ctx.fillStyle = isDark ? '#FFFFFF' : '#333333';
  ctx.beginPath();
  ctx.arc(wifiX, 22, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isDark ? '#FFFFFF' : '#333333';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(wifiX, 22, 5, -0.75 * Math.PI, -0.25 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(wifiX, 22, 9, -0.75 * Math.PI, -0.25 * Math.PI);
  ctx.stroke();

  const sigX = rightX - 54;
  ctx.fillStyle = isDark ? '#FFFFFF' : '#333333';
  ctx.fillRect(sigX - 12, 20, 2, 4);
  ctx.fillRect(sigX - 8, 17, 2, 7);
  ctx.fillRect(sigX - 4, 14, 2, 10);
  ctx.fillRect(sigX, 11, 2, 13);

  ctx.restore();
}

function drawUpiLogo(ctx, x, y, scale = 1, isDarkBackground = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#097939';
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(8, 2);
  ctx.lineTo(14, 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = isDarkBackground ? '#FFFFFF' : '#0F2C59';
  ctx.beginPath();
  ctx.moveTo(4, 14);
  ctx.lineTo(10, 6);
  ctx.lineTo(18, 14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = isDarkBackground ? '#FFFFFF' : '#0F2C59';
  ctx.font = 'italic bold 15px Arial, sans-serif';
  ctx.fillText('UPI', 22, 12);

  ctx.fillStyle = isDarkBackground ? 'rgba(255,255,255,0.6)' : '#6B7280';
  ctx.font = 'bold 5px Arial, sans-serif';
  ctx.fillText('UNIFIED PAYMENTS INTERFACE', 0, 22);

  ctx.restore();
}

function drawGPayLogoIcon(ctx, x, y, size = 32) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.18;

  ctx.strokeStyle = '#1A73E8';
  ctx.beginPath();
  ctx.arc(size * 0.35, size * 0.5, size * 0.2, 0.5 * Math.PI, 1.5 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = '#F9BC05';
  ctx.beginPath();
  ctx.moveTo(size * 0.35, size * 0.3);
  ctx.lineTo(size * 0.55, size * 0.3);
  ctx.stroke();

  ctx.strokeStyle = '#EA4335';
  ctx.beginPath();
  ctx.arc(size * 0.65, size * 0.5, size * 0.2, 1.5 * Math.PI, 0.5 * Math.PI);
  ctx.stroke();

  ctx.strokeStyle = '#34A853';
  ctx.beginPath();
  ctx.moveTo(size * 0.65, size * 0.7);
  ctx.lineTo(size * 0.45, size * 0.7);
  ctx.stroke();

  ctx.restore();
}

function drawPaytmLogo(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#00BAF2';
  ctx.font = 'italic bold 26px "Arial", sans-serif';
  ctx.fillText('pay', 0, 24);
  const offset = ctx.measureText('pay').width;

  ctx.fillStyle = '#002E7E';
  ctx.fillText('tm', offset + 1, 24);

  ctx.restore();
}

function drawPhonePeLogo(ctx, x, y, size = 36) {
  ctx.save();
  ctx.translate(x, y);

  roundRect(ctx, 0, 0, size, size, size * 0.25);
  ctx.fillStyle = '#5F259F';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = size * 0.07;
  ctx.stroke();

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-15 * Math.PI / 180);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-size * 0.14, -size * 0.14, size * 0.28, size * 0.28);

  ctx.fillStyle = '#5F259F';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/**
 * Draw bank stylized round badge logo
 */
function drawBankLogoPlaceholder(ctx, x, y, size, bankName) {
  ctx.save();
  ctx.translate(x, y);

  // Render a gradient circle representing the bank
  const grad = ctx.createLinearGradient(0, 0, size, size);
  if (bankName.includes('HDFC') || bankName.includes('ICICI')) {
    grad.addColorStop(0, '#003366');
    grad.addColorStop(1, '#0066CC');
  } else if (bankName.includes('State') || bankName.includes('Union')) {
    grad.addColorStop(0, '#00B4D8');
    grad.addColorStop(1, '#0077B6');
  } else if (bankName.includes('Axis') || bankName.includes('Kotak')) {
    grad.addColorStop(0, '#800020');
    grad.addColorStop(1, '#B91C1C');
  } else {
    grad.addColorStop(0, '#4B5563');
    grad.addColorStop(1, '#1F2937');
  }

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${Math.floor(size * 0.55)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bankName.charAt(0), size / 2, size / 2 + 1);

  ctx.restore();
}

function drawCopyIcon(ctx, x, y, size = 12) {
  ctx.save();
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';

  ctx.strokeRect(x, y, size - 3, size - 3);

  ctx.strokeRect(x + 3, y + 3, size - 3, size - 3);

  ctx.restore();
}

function drawGooglePay(ctx, width, height, data, dateStr, timeStr, userLogos) {
  const { amount, utr, senderUpi, transactionId, senderName, receiverName, bankName, bankAcc } = data;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  drawPhoneStatusBar(ctx, width, false);

  const headerY = 32;
  ctx.fillStyle = '#5F6368';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText('←', 24, headerY + 28);

  if (userLogos && userLogos.gpay) {
    ctx.drawImage(userLogos.gpay, 60, headerY + 6, 28, 28);
  } else {
    drawGPayLogoIcon(ctx, 60, headerY + 8, 30);
  }

  ctx.fillStyle = '#202124';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Google Pay', 96, headerY + 29);

  ctx.fillStyle = '#5F6368';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('?', width - 24, headerY + 30);

  const centerX = width / 2;
  const logoY = 135;
  ctx.fillStyle = '#E8F0FE';
  ctx.beginPath();
  ctx.arc(centerX, logoY, 32, 0, Math.PI * 2);
  ctx.fill();

  // Initial letter
  ctx.fillStyle = '#1A73E8';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(receiverName.charAt(0).toUpperCase(), centerX, logoY + 9);

  // Receiver Name
  ctx.fillStyle = '#202124';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText(receiverName.length > 38 ? receiverName.slice(0, 35) + '...' : receiverName, centerX, logoY + 54);

  // UPI Id
  ctx.fillStyle = '#5F6368';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(data.receiverUpi || 'fcbizgopalaneng@freecharge', centerX, logoY + 72);

  // Big Amount Display (GPay Style)
  ctx.fillStyle = '#202124';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillText(amount, centerX, logoY + 128);

  // Completed Pill
  const pillY = logoY + 148;
  roundRect(ctx, centerX - 60, pillY, 120, 26, 13);
  ctx.fillStyle = '#E6F4EA';
  ctx.fill();

  ctx.fillStyle = '#137333';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.fillText('✓ Completed', centerX, pillY + 17);

  // Date and Time
  ctx.fillStyle = '#5F6368';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(`${dateStr}, ${timeStr}`, centerX, pillY + 55);

  // Transaction details container card
  const cardX = 24;
  const cardY = pillY + 80;
  const cardW = width - 48;
  const cardH = 260;

  ctx.strokeStyle = '#DADCE0';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.stroke();

  // Draw card rows
  ctx.textAlign = 'left';
  let y = cardY + 36;
  const paddingX = 40;
  const rightAlignX = width - 40;

  function drawGPayRow(label, value, subText = '', showCopy = false) {
    ctx.fillStyle = '#5F6368';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(label, paddingX, y);

    ctx.fillStyle = '#202124';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, rightAlignX - (showCopy ? 18 : 0), y);

    if (showCopy) {
      drawCopyIcon(ctx, rightAlignX - 12, y - 10, 10);
    }

    if (subText) {
      y += 16;
      ctx.fillStyle = '#7F878F';
      ctx.font = '11px Arial, sans-serif';
      ctx.fillText(subText, rightAlignX, y);
    }

    ctx.textAlign = 'left';
    y += 42;
  }

  drawGPayRow('From: ' + senderName, senderUpi);
  drawGPayRow('Paid via', `${bankName} (${bankAcc})`, '', false);
  drawGPayRow('UPI Transaction ID', transactionId, '', true);
  drawGPayRow('Google Pay UTR', utr, '', true);

  // UPI security badge & National Payments seal at bottom
  if (userLogos && userLogos.upi) {
    ctx.drawImage(userLogos.upi, width / 2 - 36, height - 70, 72, 24);
  } else {
    drawUpiLogo(ctx, width / 2 - 40, height - 70, 0.9, false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  2. PHONEPE TEMPLATE RENDERER
// ══════════════════════════════════════════════════════════════════════════════

function drawPhonePe(ctx, width, height, data, dateStr, timeStr, userLogos) {
  const { amount, utr, senderUpi, transactionId, senderName, receiverName, bankName, bankAcc } = data;

  // Background
  ctx.fillStyle = '#F5F6F9';
  ctx.fillRect(0, 0, width, height);

  // Purple Top Block (PhonePe Signature)
  ctx.fillStyle = '#5F259F';
  ctx.fillRect(0, 0, width, 160);

  // Status Bar (White icons on purple background)
  drawPhoneStatusBar(ctx, width, true);

  // PhonePe Title Bar
  const headY = 40;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText('←', 20, headY + 24);

  // Render custom PhonePe image or fallback vector box next to title
  if (userLogos && userLogos.phonepe) {
    ctx.drawImage(userLogos.phonepe, 54, headY + 5, 26, 26);
  } else {
    drawPhonePeLogo(ctx, 54, headY + 5, 26);
  }

  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('Transaction Details', 90, headY + 21);

  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('?', width - 20, headY + 23);

  // Success green tick card indicator
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText('Transaction Successful', 54, headY + 68);

  // Draw green success check circle
  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(32, headY + 63, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✓', 32, headY + 67);

  // Timestamp caption
  ctx.textAlign = 'left';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillStyle = '#D6C1EC';
  ctx.fillText(`${dateStr} at ${timeStr}`, 54, headY + 85);

  // White Rounded Card (holds all receipts information)
  const cardX = 16;
  const cardW = width - 32;
  const cardY = 175;
  const cardH = 460;

  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Inside Card details
  ctx.fillStyle = '#6B7280';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Paid to', cardX + 20, cardY + 28);

  ctx.fillStyle = '#1F2937';
  ctx.font = 'bold 15px Arial, sans-serif';

  // Wrap receiver name over lines if long
  const words = receiverName.split(' ');
  let line = '';
  let textY = cardY + 48;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > cardW - 40) {
      ctx.fillText(line, cardX + 20, textY);
      textY += 18;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, cardX + 20, textY);
    textY += 20;
  }

  // Receiver UPI ID
  ctx.fillStyle = '#4B5563';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText(`UPI ID: ${data.receiverUpi || 'fcbizgopalaneng@freecharge'}`, cardX + 20, textY);
  textY += 42;

  // Huge PhonePe Bold Amount
  ctx.fillStyle = '#1F2937';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.fillText(amount, cardX + 20, textY);

  // PhonePe Secure Badge next to amount
  ctx.fillStyle = '#22C55E';
  ctx.beginPath();
  ctx.arc(cardX + cardW - 32, textY - 10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✓', cardX + cardW - 32, textY - 7);

  ctx.textAlign = 'left';
  textY += 28;

  // Divider line
  ctx.strokeStyle = '#F1F5F9';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cardX + 20, textY);
  ctx.lineTo(cardX + cardW - 20, textY);
  ctx.stroke();
  textY += 34;

  // Debit Details Row (with bank icon)
  ctx.fillStyle = '#6B7280';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Debited From', cardX + 20, textY);

  // Bank Round Badge
  drawBankLogoPlaceholder(ctx, cardX + 20, textY + 12, 28, bankName);

  ctx.fillStyle = '#1F2937';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(bankName, cardX + 58, textY + 22);
  ctx.fillStyle = '#6B7280';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(`A/c no. ******${bankAcc}`, cardX + 58, textY + 36);

  ctx.fillStyle = '#1F2937';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(amount, cardX + cardW - 20, textY + 25);
  ctx.textAlign = 'left';

  textY += 76;

  // Divider
  ctx.strokeStyle = '#F1F5F9';
  ctx.beginPath();
  ctx.moveTo(cardX + 20, textY);
  ctx.lineTo(cardX + cardW - 20, textY);
  ctx.stroke();
  textY += 34;

  // Sub Details Rows
  function drawPhonePeRow(label, value, showCopy = false) {
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(label, cardX + 20, textY);

    ctx.fillStyle = '#1F2937';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, cardX + cardW - (showCopy ? 36 : 20), textY);

    if (showCopy) {
      drawCopyIcon(ctx, cardX + cardW - 24, textY - 9, 9);
    }

    ctx.textAlign = 'left';
    textY += 32;
  }

  drawPhonePeRow('Transaction ID', transactionId, true);
  drawPhonePeRow('UTR Number', utr, true);

  // PhonePe bottom action bar (highly-realistic screen details)
  const btnW = (width - 40) / 2;
  const btnY = cardY + cardH + 18;

  // VIEW RECEIPT OUTLINE BUTTON
  roundRect(ctx, 16, btnY, btnW, 40, 8);
  ctx.strokeStyle = '#5F259F';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#5F259F';
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VIEW RECEIPT', 16 + btnW/2, btnY + 24);

  // SHARE RECEIPT OUTLINE BUTTON
  roundRect(ctx, width - 16 - btnW, btnY, btnW, 40, 8);
  ctx.stroke();
  ctx.fillText('SHARE RECEIPT', width - 16 - btnW/2, btnY + 24);

  // Powered by UPI security stamp at bottom
  if (userLogos && userLogos.upi) {
    ctx.drawImage(userLogos.upi, width / 2 - 36, height - 60, 72, 24);
  } else {
    drawUpiLogo(ctx, width / 2 - 40, height - 60, 0.9, false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  3. PAYTM TEMPLATE RENDERER
// ══════════════════════════════════════════════════════════════════════════════

function drawPaytm(ctx, width, height, data, dateStr, timeStr, userLogos) {
  const { amount, utr, senderUpi, transactionId, senderName, receiverName, bankName, bankAcc } = data;

  // Background
  ctx.fillStyle = '#F4F7FC';
  ctx.fillRect(0, 0, width, height);

  // Status Bar
  drawPhoneStatusBar(ctx, width, false);

  // Paytm Top Blue Header Bar
  ctx.fillStyle = '#0F2C59';
  ctx.fillRect(0, 32, width, 56);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText('←', 24, 66);

  // Render custom Paytm logo image or fallback vector text
  if (userLogos && userLogos.paytm) {
    ctx.drawImage(userLogos.paytm, 60, 44, 76, 26);
  } else {
    drawPaytmLogo(ctx, 60, 42, 1.1);
  }

  // Scalloped Ticket Style Card (Authentic Paytm layout)
  const ticketX = 18;
  const ticketW = width - 36;
  const ticketY = 104;
  const ticketH = 460;

  // Main Rounded Ticket background
  roundRect(ctx, ticketX, ticketY, ticketW, ticketH, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = '#D1E0F5';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Draw Scalloped tear holes along the card bottom edge for 100% Paytm visual realism
  ctx.save();
  ctx.fillStyle = '#F4F7FC'; // match body background
  const scallopRadius = 7;
  const scallopInterval = 20;
  const bottomY = ticketY + ticketH;
  for (let sx = ticketX + scallopRadius + 6; sx < ticketX + ticketW; sx += scallopInterval) {
    ctx.beginPath();
    ctx.arc(sx, bottomY, scallopRadius, 0, Math.PI, true);
    ctx.fill();
    ctx.strokeStyle = '#D1E0F5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(sx, bottomY, scallopRadius, 0, Math.PI, true);
    ctx.stroke();
  }
  ctx.restore();

  // "UPI Money Transfer" text
  ctx.fillStyle = '#7C8B9E';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.fillText('UPI MONEY TRANSFER', ticketX + 24, ticketY + 32);

  // Receiver Name
  ctx.fillStyle = '#0F2C59';
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText(receiverName.length > 40 ? receiverName.slice(0, 37) + '...' : receiverName, ticketX + 24, ticketY + 58);

  // Receiver UPI ID
  ctx.fillStyle = '#5C6C7F';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(`To UPI ID: ${data.receiverUpi || 'fcbizgopalaneng@freecharge'}`, ticketX + 24, ticketY + 76);

  // Big bold Paytm amount
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 42px Arial, sans-serif';
  ctx.fillText(amount, ticketX + 24, ticketY + 130);

  // Success green badge tick
  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(ticketX + 34, ticketY + 164, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✓', ticketX + 34, ticketY + 167);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('Success', ticketX + 48, ticketY + 169);

  // Date and Time
  ctx.fillStyle = '#6B7280';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText(`${dateStr}, ${timeStr}`, ticketX + 24, ticketY + 202);

  // Internal dotted divider
  ctx.save();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(ticketX + 24, ticketY + 224);
  ctx.lineTo(ticketX + ticketW - 24, ticketY + 224);
  ctx.stroke();
  ctx.restore();

  // Paytm Transaction Info Rows
  let y = ticketY + 264;
  function drawPaytmRow(label, val, showCopy = false) {
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(label, ticketX + 24, y);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, ticketX + ticketW - (showCopy ? 36 : 24), y);

    if (showCopy) {
      drawCopyIcon(ctx, ticketX + ticketW - 26, y - 9, 9);
    }

    ctx.textAlign = 'left';
    y += 34;
  }

  drawPaytmRow('From', senderName);
  drawPaytmRow('Sender UPI ID', senderUpi);
  drawPaytmRow('From Bank', `${bankName} (${bankAcc})`);
  drawPaytmRow('Wallet / Ref ID', transactionId, true);
  drawPaytmRow('UTR (Bank Ref)', utr, true);

  // Paytm bottom call-to-actions
  const btnW = (width - 48) / 2;
  const bY = ticketY + ticketH + 20;

  // PAY AGAIN BUTTON
  roundRect(ctx, 20, bY, btnW, 40, 8);
  ctx.fillStyle = '#00BAF2';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Pay Again', 20 + btnW/2, bY + 24);

  // SHARE OUTLINE BUTTON
  roundRect(ctx, width - 20 - btnW, bY, btnW, 40, 8);
  ctx.strokeStyle = '#00BAF2';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#00BAF2';
  ctx.fillText('Share Receipt', width - 20 - btnW/2, bY + 24);

  // Paytm secure badge & UPI trademark footer
  if (userLogos && userLogos.upi) {
    ctx.drawImage(userLogos.upi, width / 2 - 36, height - 60, 72, 24);
  } else {
    drawUpiLogo(ctx, width / 2 - 40, height - 60, 0.9, false);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT (Dispatches to chosen template)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a highly realistic UPI payment receipt image using a random design
 * (Google Pay, PhonePe, or Paytm) with complete graphic alignment and logo support.
 */
async function generatePaymentReceipt(paymentData) {
  const {
    amount = '₹299',
    utr,
    senderUpi,
    transactionId,
    senderName,
    phone,
    receiverName = 'GOPALAN COLLEGE OF ENGINEERING AND MANAGEMENT',
    receiverUpi = 'fcbizgopalaneng@freecharge',
  } = paymentData;

  const now = new Date();
  const dateStr = formatDate(now, 'short');
  const timeStr = formatTime(now, false);

  // Random bank name and last 4 digits
  const bankName = BANKS[Math.floor(Math.random() * BANKS.length)];
  const bankAcc = String(Math.floor(1000 + Math.random() * 9000));

  const inputData = {
    amount,
    utr,
    senderUpi,
    transactionId,
    senderName,
    phone,
    receiverName,
    receiverUpi,
    bankName,
    bankAcc
  };

  // Preload any user-uploaded custom logos asynchronously (falls back to null if missing)
  const userLogos = {
    gpay: await getLogoImage('gpay.png'),
    phonepe: await getLogoImage('phonepe.png'),
    paytm: await getLogoImage('paytm.png'),
    upi: await getLogoImage('upi.png')
  };

  // Dimensions matching standard mobile view aspects
  const WIDTH = 480;
  const HEIGHT = 840;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Randomly pick design template
  const designs = ['gpay', 'phonepe', 'paytm'];
  const chosenDesign = designs[Math.floor(Math.random() * designs.length)];

  console.log(`[RECEIPT] Rendering high-fidelity receipt using template: ${chosenDesign.toUpperCase()}`);

  if (chosenDesign === 'gpay') {
    drawGooglePay(ctx, WIDTH, HEIGHT, inputData, dateStr, timeStr, userLogos);
  } else if (chosenDesign === 'phonepe') {
    drawPhonePe(ctx, WIDTH, HEIGHT, inputData, dateStr, timeStr, userLogos);
  } else {
    drawPaytm(ctx, WIDTH, HEIGHT, inputData, dateStr, timeStr, userLogos);
  }

  // Export high resolution png buffer
  const pngBuffer = canvas.toBuffer('image/png');

  // File naming
  const filename = `receipt_${utr}_${Date.now()}.jpg`;
  const outputPath = path.join(RECEIPTS_DIR, filename);

  // Force JPEG compression to keep files compact and realistic
  await compressBuffer(pngBuffer, outputPath);

  console.log(`[RECEIPT] Saved high-fidelity compressed receipt to: ${filename}`);
  return outputPath;
}

module.exports = { generatePaymentReceipt };
