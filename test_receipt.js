
const { generatePaymentReceipt } = require('./utils/paymentGenerator');

(async () => {
  const receiptPath = await generatePaymentReceipt({
    amount: '₹299',
    utr: '384729156034',
    senderUpi: '9876543210@paytm',
    transactionId: 'T2605111230847261',
    senderName: 'Rahul Sharma',
    phone: '9876543210',
    receiverName: 'GOPALAN COLLEGE OF ENGINEERING AND MANAGEMENT',
    receiverUpi: 'fcbizgopalaneng@freecharge',
  });
  console.log('Receipt saved to:', receiptPath);
})();
