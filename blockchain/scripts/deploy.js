const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

async function main() {
  // ── Deployer info ──────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log("WasteWise Deployment");
  console.log("=".repeat(60));
  console.log(`Network   : ${network.name}`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(balance)} ETH`);
  console.log("-".repeat(60));

  // ── Deploy WasteToken ──────────────────────────────────────────────────────
  console.log("\n[1/3] Deploying WasteToken...");
  const WasteToken    = await ethers.getContractFactory("WasteToken");
  const wasteToken    = await WasteToken.deploy(deployer.address);
  await wasteToken.waitForDeployment();
  const tokenAddress  = await wasteToken.getAddress();
  console.log(`      WasteToken deployed at: ${tokenAddress}`);

  // ── Deploy RewardDistributor ───────────────────────────────────────────────
  console.log("\n[2/3] Deploying RewardDistributor...");
  const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
  const distributor       = await RewardDistributor.deploy(tokenAddress, deployer.address);
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log(`      RewardDistributor deployed at: ${distributorAddress}`);

  // ── Wire up: set RewardDistributor as the minter ──────────────────────────
  console.log("\n[3/3] Setting RewardDistributor as WasteToken minter...");
  const tx = await wasteToken.setMinter(distributorAddress);
  await tx.wait();
  console.log(`      Minter set (tx: ${tx.hash})`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log(`Network            : ${network.name}`);
  console.log(`WasteToken         : ${tokenAddress}`);
  console.log(`RewardDistributor  : ${distributorAddress}`);
  console.log("=".repeat(60));

  // ── Persist addresses to deployments/<network>.json ───────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, `${network.name}.json`);
  const deploymentData = {
    network:            network.name,
    deployedAt:         new Date().toISOString(),
    deployer:           deployer.address,
    WasteToken:         tokenAddress,
    RewardDistributor:  distributorAddress,
  };

  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log(`\nAddresses saved to: ${outputPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
