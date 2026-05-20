const { ethers }  = require("hardhat");
const { expect }  = require("chai");

describe("WasteToken", function () {
  // ── Fixtures / shared state ────────────────────────────────────────────────
  let owner, minter, user, other;
  let token;

  beforeEach(async function () {
    [owner, minter, user, other] = await ethers.getSigners();

    const WasteToken = await ethers.getContractFactory("WasteToken");
    token = await WasteToken.deploy(owner.address);
    await token.waitForDeployment();
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should have the correct name", async function () {
      expect(await token.name()).to.equal("WasteWise Token");
    });

    it("should have the correct symbol", async function () {
      expect(await token.symbol()).to.equal("WWT");
    });

    it("should have 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18n);
    });

    it("should set the deployer as owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("should have no minter set initially", async function () {
      expect(await token.minter()).to.equal(ethers.ZeroAddress);
    });

    it("should have zero initial total supply", async function () {
      expect(await token.totalSupply()).to.equal(0n);
    });
  });

  // ── setMinter ─────────────────────────────────────────────────────────────

  describe("setMinter", function () {
    it("owner can set a minter", async function () {
      await token.connect(owner).setMinter(minter.address);
      expect(await token.minter()).to.equal(minter.address);
    });

    it("non-owner cannot set a minter", async function () {
      await expect(
        token.connect(user).setMinter(minter.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("emits MinterUpdated event with correct args", async function () {
      await expect(token.connect(owner).setMinter(minter.address))
        .to.emit(token, "MinterUpdated")
        .withArgs(ethers.ZeroAddress, minter.address);
    });

    it("emits MinterUpdated with previous minter address when updating", async function () {
      await token.connect(owner).setMinter(minter.address);
      await expect(token.connect(owner).setMinter(other.address))
        .to.emit(token, "MinterUpdated")
        .withArgs(minter.address, other.address);
    });

    it("reverts when setting minter to the zero address", async function () {
      await expect(
        token.connect(owner).setMinter(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });
  });

  // ── mint ──────────────────────────────────────────────────────────────────

  describe("mint", function () {
    const MINT_AMOUNT = ethers.parseEther("100");

    beforeEach(async function () {
      await token.connect(owner).setMinter(minter.address);
    });

    it("authorised minter can mint tokens", async function () {
      await token.connect(minter).mint(user.address, MINT_AMOUNT);
      expect(await token.balanceOf(user.address)).to.equal(MINT_AMOUNT);
    });

    it("non-minter cannot mint tokens", async function () {
      await expect(
        token.connect(other).mint(user.address, MINT_AMOUNT)
      ).to.be.revertedWithCustomError(token, "NotMinter");
    });

    it("owner (who is not the minter) cannot mint tokens", async function () {
      await expect(
        token.connect(owner).mint(user.address, MINT_AMOUNT)
      ).to.be.revertedWithCustomError(token, "NotMinter");
    });

    it("balance increases correctly after mint", async function () {
      const first  = ethers.parseEther("50");
      const second = ethers.parseEther("75");

      await token.connect(minter).mint(user.address, first);
      await token.connect(minter).mint(user.address, second);

      expect(await token.balanceOf(user.address)).to.equal(first + second);
    });

    it("total supply tracks minted amounts correctly", async function () {
      const amountA = ethers.parseEther("200");
      const amountB = ethers.parseEther("300");

      await token.connect(minter).mint(user.address,  amountA);
      await token.connect(minter).mint(other.address, amountB);

      expect(await token.totalSupply()).to.equal(amountA + amountB);
    });

    it("emits Transfer event from zero address on mint", async function () {
      await expect(token.connect(minter).mint(user.address, MINT_AMOUNT))
        .to.emit(token, "Transfer")
        .withArgs(ethers.ZeroAddress, user.address, MINT_AMOUNT);
    });
  });

  // ── Minter change ─────────────────────────────────────────────────────────

  describe("Minter change", function () {
    it("owner can update the minter to a new address", async function () {
      await token.connect(owner).setMinter(minter.address);
      await token.connect(owner).setMinter(other.address);
      expect(await token.minter()).to.equal(other.address);
    });

    it("old minter loses minting ability after update", async function () {
      await token.connect(owner).setMinter(minter.address);
      await token.connect(owner).setMinter(other.address);

      await expect(
        token.connect(minter).mint(user.address, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(token, "NotMinter");
    });

    it("new minter can mint after the update", async function () {
      await token.connect(owner).setMinter(minter.address);
      await token.connect(owner).setMinter(other.address);

      const amount = ethers.parseEther("10");
      await token.connect(other).mint(user.address, amount);
      expect(await token.balanceOf(user.address)).to.equal(amount);
    });
  });
});
