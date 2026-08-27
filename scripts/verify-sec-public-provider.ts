import {
  DirectSecPublicDataTransport,
  SecPublicMarketProvider
} from "../lib/broadstone/providers/sec-public-market-provider.ts";

const [ticker, cik] = process.argv.slice(2);
const userAgent = process.env.SEC_USER_AGENT;

if (!ticker || !cik || !userAgent) {
  console.error(
    "Usage: SEC_USER_AGENT=\"Broadstone contact@example.com\" npm run verify:public-data -- AAPL 320193"
  );
  process.exitCode = 1;
} else {
  const provider = new SecPublicMarketProvider(
    new DirectSecPublicDataTransport(userAgent)
  );
  const lookup = await provider.lookupCompany(ticker);
  const companyData = await provider.getCompanyData({
    broadstoneCompanyId: `manual-${ticker.toLowerCase()}`,
    cik,
    ticker,
    maxAnnualPeriods: 3
  });

  console.log(JSON.stringify({ lookup, companyData }, null, 2));
  process.exitCode = lookup.data && companyData.data ? 0 : 1;
}
