const fs = require('fs');
const path = require('path');
const { fakerEN_IN } = require('@faker-js/faker');

const NAMES_FILE = path.join(__dirname, '..', 'NAMES.TXT');
const COLLEGES_FILE = path.join(__dirname, '..', 'COLLEGES.TXT');

function loadLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const names = loadLines(NAMES_FILE);
const colleges = loadLines(COLLEGES_FILE);

const EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'yahoo.com',
  'hotmail.com',
  'protonmail.com',
  'icloud.com',
];

const BRANCHES = [
  'CSE',
  'AIML',
  'ISE',
  'ECE',
  'EEE',
  'ME',
  'CIVIL',
  'AIDS',
  'CSBS',
  'IT',
  'CCE',
  'BT',
  'CSD',
];

const SEMESTERS = [
  '1st Sem',
  '2nd Sem',
  '3rd Sem',
  '4th Sem',
  '5th Sem',
  '6th Sem',
  '7th Sem',
  '8th Sem',
];

const UPI_SUFFIXES = [
  '@paytm',
  '@ybl',
  '@ibl',
  '@okaxis',
  '@oksbi',
  '@okhdfcbank',
  '@axl',
  '@upi',
  '@apl',
  '@freecharge',
];

const usedEmails = new Set();
const usedPhones = new Set();
const usedUtrs = new Set();

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDigits(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

function getRandomName() {
  try {
    return fakerEN_IN.person.fullName();
  } catch (err) {
    const firstName = pickRandom(names);
    const lastNames = [
      'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar',
      'Patel', 'Reddy', 'Nair', 'Joshi', 'Rao',
      'Mehta', 'Shah', 'Iyer', 'Menon', 'Pillai',
      'Hegde', 'Naik', 'Shetty', 'Gowda', 'Bhat',
    ];
    return `${firstName} ${pickRandom(lastNames)}`;
  }
}

function getUniqueEmail(fullName) {
  const firstName = fullName.split(' ')[0].toLowerCase();
  let email;
  let attempts = 0;

  do {
    const domain = pickRandom(EMAIL_DOMAINS);
    const suffix = attempts > 0 ? randomInt(1, 9999) : '';
    email = `${firstName}${suffix}@${domain}`;
    attempts++;
  } while (usedEmails.has(email) && attempts < 100);

  usedEmails.add(email);
  return email;
}

function getUniquePhone() {
  let phone;
  let attempts = 0;

  do {
    const startDigit = pickRandom(['6', '7', '8', '9']);
    phone = startDigit + randomDigits(9);
    attempts++;
  } while (usedPhones.has(phone) && attempts < 100);

  usedPhones.add(phone);
  return phone;
}

function getRandomCollege() {
  return pickRandom(colleges);
}

function getRandomBranch() {
  return pickRandom(BRANCHES);
}

function getRandomSemester() {
  return pickRandom(SEMESTERS);
}

function getUniqueUtr() {
  let utr;
  let attempts = 0;

  do {
    utr = randomDigits(12);
    attempts++;
  } while (usedUtrs.has(utr) && attempts < 100);

  usedUtrs.add(utr);
  return utr;
}

function getSenderUpi(phone) {
  return phone + pickRandom(UPI_SUFFIXES);
}

function getTransactionId() {
  return 'T' + Date.now().toString().slice(-10) + randomDigits(6);
}

function generateRegistrationData() {
  const fullName = getRandomName();
  const email = getUniqueEmail(fullName);
  const phone = getUniquePhone();
  const college = getRandomCollege();
  const branch = getRandomBranch();
  const semester = getRandomSemester();
  const utr = getUniqueUtr();
  const senderUpi = getSenderUpi(phone);
  const transactionId = getTransactionId();
  const payeeUpi = 'fcbizgopalaneng@freecharge';

  return {
    fullName,
    email,
    phone,
    college,
    branch,
    semester,
    utr,
    senderUpi,
    transactionId,
    payeeUpi,
  };
}

async function humanDelay(page, minMs = 50, maxMs = 250) {
  if (minMs === 0 && maxMs === 0) return;

  const ms =
    Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

  if (page) {
    await page.waitForTimeout(ms);
  } else {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function humanType(page, selector, text) {
  const el = page.locator(selector).first();

  await el.waitFor({
    state: 'visible',
    timeout: 5000,
  });

  await el.click();

  await el.pressSequentially(text, {
    delay: randomInt(50, 150),
  });
}

module.exports = {
  getRandomName,
  getUniqueEmail,
  getUniquePhone,
  getRandomCollege,
  getRandomBranch,
  getRandomSemester,
  getUniqueUtr,
  getSenderUpi,
  getTransactionId,
  generateRegistrationData,
  humanDelay,
  humanType,
  pickRandom,
  randomInt,
  randomDigits,
};