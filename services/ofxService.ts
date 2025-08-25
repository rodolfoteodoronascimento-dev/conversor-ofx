import type { Transaction } from '../types';

function generateUniqueId(transaction: Transaction, index: number): string {
  // Create a pseudo-unique ID from transaction data to help prevent duplicates on import
  // OFX FITID has a max length of 255.
  const cleanDesc = transaction.description.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  return `${transaction.date}-${transaction.amount.toFixed(2)}-${cleanDesc}-${index}`.slice(0, 255);
}

export function createOfxContent(transactions: Transaction[]): string {
  const now = new Date();
  const dateCreated = `${now.getFullYear().toString()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  
  // Using more realistic placeholders, assuming a Brazilian context from recent user inputs.
  const bankId = "001"; // e.g., Banco do Brasil
  const acctId = "999999-9"; // Placeholder
  const acctType = "CHECKING";
  const currency = "BRL";

  const sortedTransactions = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  const startDate = sortedTransactions.length > 0 ? sortedTransactions[0].date : dateCreated;
  const endDate = sortedTransactions.length > 0 ? sortedTransactions[sortedTransactions.length - 1].date : dateCreated;

  const transactionListString = sortedTransactions.map((t, index) => `
<STMTTRN>
<TRNTYPE>${t.amount > 0 ? 'CREDIT' : 'DEBIT'}</TRNTYPE>
<DTPOSTED>${t.date}</DTPOSTED>
<TRNAMT>${t.amount.toFixed(2)}</TRNAMT>
<FITID>${generateUniqueId(t, index)}</FITID>
<MEMO>${t.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</MEMO>
</STMTTRN>`).join('');

  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE
<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>${dateCreated}</DTSERVER>
<LANGUAGE>POR</LANGUAGE>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>${currency}</CURDEF>
<BANKACCTFROM>
<BANKID>${bankId}</BANKID>
<ACCTID>${acctId}</ACCTID>
<ACCTTYPE>${acctType}</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${startDate}</DTSTART>
<DTEND>${endDate}</DTEND>${transactionListString}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>0.00</BALAMT>
<DTASOF>${dateCreated}</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`.trim();
}
