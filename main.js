const { Web3 } = require('web3');
const axios = require('axios');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

// ASCII Art and Configuration
const BANNER = `
██   ██ ███████ ██      ██  ██████  ███████
██   ██ ██      ██      ██ ██    ██ ██
███████ █████   ██      ██ ██    ██ ███████
██   ██ ██      ██      ██ ██    ██      ██
██   ██ ███████ ███████ ██  ██████  ███████
HELIOS TESTNET AUTOMATION BY TheAnonim
`;

// Configuration
const config = {
  chainId: 42000,
  networkName: 'Helios',
  rpcUrl: 'https://testnet1.helioschainlabs.org',
  currencySymbol: 'HELIOS',
  explorerUrl: 'https://explorer.helioschainlabs.org/',
  apiBaseUrl: 'https://testnet-api.helioschain.network/api'
};

// Proxy management
let proxies = [];
let currentProxyIndex = 0;

// Load proxies from file
function loadProxies() {
  try {
    const proxyData = fs.readFileSync('proxies.txt', 'utf8');
    proxies = proxyData.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        if (line.includes('://')) {
          return line;
        }
        return `http://${line}`;
      });
    
    if (proxies.length === 0) {
      console.log('ℹ️ No proxies found in proxies.txt, will proceed without proxies');
    }
  } catch (err) {
    console.log('ℹ️ Could not read proxies.txt, will proceed without proxies');
    proxies = [];
  }
}

// Get the next proxy in rotation
function getNextProxy() {
  if (proxies.length === 0) return null;
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  return proxies[currentProxyIndex];
}

// Create axios instance with proxy support
function createAxiosInstance() {
  const proxyUrl = getNextProxy();
  
  const instance = axios.create({
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://testnet.helioschain.network',
      'Referer': 'https://testnet.helioschain.network/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (proxyUrl) {
    try {
      const proxyAgent = new HttpsProxyAgent(proxyUrl);
      instance.defaults.httpsAgent = proxyAgent;
      instance.defaults.httpAgent = proxyAgent;
    } catch (err) {
      console.log(`⚠️ Failed to setup proxy ${proxyUrl}, proceeding without proxy`);
    }
  }

  return instance;
}

// Initialize Web3 with proxy support
function createWeb3Instance() {
  if (proxies.length > 0) {
    const proxyUrl = getNextProxy();
    if (proxyUrl) {
      try {
        const proxyAgent = new HttpsProxyAgent(proxyUrl);
        return new Web3(new Web3.providers.HttpProvider(config.rpcUrl, { agent: proxyAgent }));
      } catch (err) {
        console.log(`⚠️ Failed to setup Web3 with proxy, using direct connection`);
      }
    }
  }
  return new Web3(new Web3.providers.HttpProvider(config.rpcUrl));
}

let web3 = createWeb3Instance();

// Read multiple private keys from file
function getPrivateKeys() {
  try {
    const data = fs.readFileSync('privatekeys.txt', 'utf8');
    return data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch (err) {
    console.error('❌ Error reading private keys file:', err);
    process.exit(1);
  }
}

// Get wallet address from private key
function getWalletAddress(privateKey) {
  try {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    return account.address;
  } catch (err) {
    console.error('❌ Error getting wallet address:', err);
    return null;
  }
}

// Sign message for verification
async function signVerificationMessage(walletAddress, privateKey) {
  const message = `Welcome to Helios! Please sign this message to verify your wallet ownership.\n\nWallet: ${walletAddress}`;
  const signature = web3.eth.accounts.sign(message, privateKey);
  return signature.signature;
}

// Add delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff and proxy rotation
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429 || (error.response?.status >= 500 && error.response?.status < 600)) {
        if (attempt === maxRetries) {
          throw error;
        }
        const delayTime = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`⚠️  Rate limited. Retrying... (${attempt}/${maxRetries})`);
        
        if (proxies.length > 0) {
          web3 = createWeb3Instance();
          console.log('🔁 Rotating proxy...');
        }
        
        await delay(delayTime);
        continue;
      }
      throw error;
    }
  }
}

// Check if user exists and login
async function attemptLogin(walletAddress, signature) {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post(`${config.apiBaseUrl}/users/login`, {
        wallet: walletAddress,
        signature: signature
      });
    });
    
    return response.data.token;
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

// Register user
async function registerUser(walletAddress, signature, inviteCode) {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post(`${config.apiBaseUrl}/users/confirm-account`, {
        wallet: walletAddress,
        signature: signature,
        inviteCode: inviteCode
      });
    }, 5, 2000);
    
    if (response.data.success) {
      return {
        token: response.data.token,
        userId: response.data.user?._id,
        referralCode: response.data.user?.referralCode
      };
    }
    throw new Error(response.data.message || 'Unknown error');
  } catch (err) {
    throw err;
  }
}

// Get onboarding progress
async function getOnboardingProgress(token) {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.get(`${config.apiBaseUrl}/users/onboarding/progress`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    });
    
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Start onboarding step
async function startOnboardingStep(token, stepKey) {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post(`${config.apiBaseUrl}/users/onboarding/start`, {
        stepKey: stepKey
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    });
    
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Complete onboarding step
async function completeOnboardingStep(token, stepKey, evidence) {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post(`${config.apiBaseUrl}/users/onboarding/complete`, {
        stepKey: stepKey,
        evidence: evidence
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    });
    
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Request faucet tokens
async function requestFaucetTokens(token, chain, amount = 1) {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post(`${config.apiBaseUrl}/faucet/request`, {
        token: 'HLS',
        chain: chain || 'helios-testnet',
        amount: amount
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    });
    
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Claim onboarding reward
async function claimOnboardingReward(token, rewardType = 'xp') {
  try {
    const axiosInstance = createAxiosInstance();
    
    const response = await retryWithBackoff(async () => {
      return await axiosInstance.post(`${config.apiBaseUrl}/users/onboarding/claim-reward`, {
        rewardType: rewardType
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    });
    
    return response.data;
  } catch (err) {
    throw err;
  }
}

// Get wallet balance
async function getWalletBalance(walletAddress) {
  try {
    const balance = await web3.eth.getBalance(walletAddress);
    return web3.utils.fromWei(balance, 'ether');
  } catch (err) {
    return '0';
  }
}

// Print separator line
function printSeparator() {
  console.log('════════════════════════════════════════════');
}

// Process a single account
async function processAccount(privateKey, inviteCode, accountIndex, totalAccounts) {
  try {
    const walletAddress = getWalletAddress(privateKey);
    if (!walletAddress) {
      console.log(`❌ Invalid private key for account ${accountIndex + 1}`);
      return;
    }

    // Display ASCII Art and header
    console.log(BANNER);
    printSeparator();
    console.log(`Account Available : ${totalAccounts}`);
    console.log(`🔐 Wallet Loaded     : ${walletAddress}`);
    
    const balance = await getWalletBalance(walletAddress);
    console.log(`💳 Initial Balance   : ${balance} ${config.currencySymbol}`);
    console.log(`🌐 Proxies Loaded    : ${proxies.length}`);
    console.log(`🔗 Invite Code Used  : ${inviteCode || 'None'}`);
    printSeparator();

    if (proxies.length > 0) {
      const proxyUrl = getNextProxy();
      console.log(`🌐 Proxy Used        : ${proxyUrl}`);
    }

    // Step 1: Sign verification message
    console.log('🔐 Step 1: Signing Verification Message');
    const signature = await signVerificationMessage(walletAddress, privateKey);
    console.log('✅ Message signed successfully');

    // Step 2: Authentication
    console.log('🔑 Step 2: Authentication');
    let authToken = await attemptLogin(walletAddress, signature);
    let userInfo = {};
    
    if (!authToken) {
      console.log('ℹ️  User not found. Proceeding with registration...');
      try {
        const registration = await registerUser(walletAddress, signature, inviteCode);
        authToken = registration.token;
        userInfo.userId = registration.userId;
        userInfo.referralCode = registration.referralCode;
        console.log('✅ Registration successful!');
      } catch (regErr) {
        if (regErr.response?.data?.message?.includes('invite code')) {
          console.log('⚠️  Invite code issue. Trying without invite code...');
          try {
            const registration = await registerUser(walletAddress, signature, null);
            authToken = registration.token;
            userInfo.userId = registration.userId;
            userInfo.referralCode = registration.referralCode;
            console.log('✅ Registration successful without invite code!');
          } catch (secondErr) {
            throw secondErr;
          }
        } else {
          throw regErr;
        }
      }
    }
    
    if (!authToken) throw new Error('Failed to obtain auth token');
    
    console.log('👤 User Info');
    console.log(`   • User ID         : ${userInfo.userId || 'N/A'}`);
    console.log(`   • Referral Code   : ${userInfo.referralCode || 'N/A'}`);
    console.log(`   • Auth Token      : ${authToken ? '✅ Received' : '❌ Failed'}`);

    // Step 3: Onboarding Progress
    console.log('📊 Step 3: Onboarding Progress');
    const progress = await getOnboardingProgress(authToken);
    console.log('✅ Progress Retrieved');
    console.log(`   • Completed Steps : ${progress.completedSteps?.length || 0}`);
    console.log(`   • Is Complete     : ${progress.isOnboardingComplete ? '✅ Yes' : '❌ No'}`);

    // Step 4: Complete onboarding steps
    const onboardingSteps = [
      { key: 'add_helios_network', evidence: 'network_added', description: 'Add Helios Network' },
      { key: 'claim_from_faucet', evidence: 'tokens_claimed', description: 'Claim from Faucet' },
      { key: 'mint_early_bird_nft', evidence: 'nft_minted', description: 'Mint Early Bird NFT' }
    ];

    for (const step of onboardingSteps) {
      if (progress.completedSteps?.includes(step.key)) {
        continue;
      }

      console.log(`🛠️  Task: ${step.description}`);
      await startOnboardingStep(authToken, step.key);
      await delay(2000);
      
      if (step.key === 'claim_from_faucet') {
        try {
          await requestFaucetTokens(authToken);
          console.log('💰 Faucet tokens claimed successfully');
        } catch (err) {
          console.log('⚠️  Faucet claim failed, continuing...');
        }
        await delay(2000);
      }
      
      await completeOnboardingStep(authToken, step.key, step.evidence);
      console.log(`✅ ${step.description} completed successfully`);
      await delay(3000);
    }

    // Step 5: Final check and reward
    console.log('🎁 Task: Final Check & Reward Claim');
    const finalProgress = await getOnboardingProgress(authToken);
    console.log('📊 Progress');
    console.log(`   • Completed Steps : ${finalProgress.completedSteps?.length || 0}`);
    console.log(`   • Is Complete     : ${finalProgress.isOnboardingComplete ? '✅ Yes' : '❌ No'}`);
    
    if (finalProgress.isOnboardingComplete) {
      try {
        await claimOnboardingReward(authToken);
        console.log('🎉 Reward claimed successfully!');
      } catch (err) {
        console.log('⚠️  Reward claim failed');
      }
    }

    // Final balance check
    const finalBalance = await getWalletBalance(walletAddress);
    console.log('💰 Final Balance Check');
    console.log(`   • Final Balance   : ${finalBalance} ${config.currencySymbol}`);
    const balanceGained = (parseFloat(finalBalance) - parseFloat(balance)).toFixed(6);
    console.log(`   • Balance Gained  : ${balanceGained.startsWith('-') ? '' : '+'}${balanceGained} ${config.currencySymbol}`);
    
    printSeparator();
    console.log('✅ PROCESS COMPLETED SUCCESSFULLY');
    printSeparator();
    
    // Summary
    console.log('📋 SUMMARY');
    console.log(`   • Wallet Address   : ${walletAddress}`);
    console.log(`   • Final Balance    : ${finalBalance} ${config.currencySymbol}`);
    console.log(`   • Completed Steps  : ${finalProgress.completedSteps?.length || 0}`);
    console.log(`   • Onboarding Done  : ${finalProgress.isOnboardingComplete ? '✅ Yes' : '❌ No'}`);
    printSeparator();
    
    return true;
  } catch (err) {
    console.log('❌ PROCESS FAILED');
    printSeparator();
    console.log('📋 ERROR SUMMARY');
    console.log(`   • Wallet Address   : ${getWalletAddress(privateKey) || 'Unknown'}`);
    console.log(`   • Error            : ${err.message}`);
    if (err.response?.data) {
      console.log(`   • API Response     : ${JSON.stringify(err.response.data)}`);
    }
    printSeparator();
    return false;
  }
}

// Main function to process all accounts
async function processAllAccounts() {
  // Load proxies and private keys
  loadProxies();
  const privateKeys = getPrivateKeys();
  const totalAccounts = privateKeys.length;
  
  if (totalAccounts === 0) {
    console.log('❌ No private keys found in privatekeys.txt');
    process.exit(1);
  }
  
  // Get invite code from user input
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const inviteCode = await new Promise(resolve => {
    readline.question('Enter invite code: ', (answer) => {
      resolve(answer.trim() || null);
    });
  });

  readline.close();
  
  // Clear console after getting invite code
  console.clear();
  
  // Process accounts sequentially
  let successfulAccounts = 0;
  for (let i = 0; i < totalAccounts; i++) {
    const success = await processAccount(privateKeys[i], inviteCode, i, totalAccounts);
    if (success) successfulAccounts++;
    
    // Add delay between accounts
    if (i < totalAccounts - 1) {
      await delay(5000);
      console.log('\n'); // Space between accounts
    }
  }
}

// Error handling
process.on('SIGINT', () => {
  console.log('\n⚠️ Process interrupted by user');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the automation
if (require.main === module) {
  processAllAccounts();
}