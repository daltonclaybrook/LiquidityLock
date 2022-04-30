// Register ts-node loader for future requires
require("ts-node").register({
    files: true,
});

require("dotenv").config();
const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
    networks: {
        development: {
            host: "127.0.0.1",
            port: 8545,
            network_id: "*",
        },

        rinkeby: {
            provider: () =>
                new HDWalletProvider({
                    privateKeys: [process.env.RINKEBY_PRIVATE_KEY],
                    providerOrUrl: process.env.RINKEBY_URL,
                }),
            network_id: "4", // Rinkeby network ID
        },
    },

    // Set default mocha options here, use special reporters etc.
    mocha: {
        // timeout: 100000
    },

    // Configure your compilers
    compilers: {
        solc: {
            version: "0.8.12",
            settings: {
                optimizer: {
                    enabled: true, // This is required to fix a compiler error in LiquidityLock.sol
                    runs: 200,
                },
            },
        },
    },

    plugins: ["truffle-plugin-verify"],

    api_keys: {
        etherscan: process.env.ETHERSCAN_TOKEN,
    },
};
