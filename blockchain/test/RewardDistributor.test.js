const { ethers }  = require("hardhat");
const { expect }  = require("chai");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert grams → expected total WWT (wei) at the default 10 WWT/kg rate */
function expectedTotal(grams) {
  const tokensPerKg = ethers.parseEther("10");
  return (BigInt(grams) * tokensPerKg) / 1000n;
}

function immediate(total) { return (total * 70n) / 100n; }
function pending(total)   { return total - immediate(total); }

/** Create a deterministic bytes32 ID from a plain string */
function sid(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RewardDistributor", function () {
  let owner, verifier, company, user, other, centerWallet;
  let token, distributor;

  const CENTER_ID = 1n;

  beforeEach(async function () {
    [owner, verifier, company, user, other, centerWallet] =
      await ethers.getSigners();

    // Deploy token
    const WasteToken = await ethers.getContractFactory("WasteToken");
    token = await WasteToken.deploy(owner.address);
    await token.waitForDeployment();

    // Deploy distributor
    const RewardDistributor = await ethers.getContractFactory("RewardDistributor");
    distributor = await RewardDistributor.deploy(
      await token.getAddress(),
      owner.address
    );
    await distributor.waitForDeployment();

    // Wire up: distributor is the minter
    await token.connect(owner).setMinter(await distributor.getAddress());

    // Authorize verifier & company
    await distributor.connect(owner).setVerifier(verifier.address, true);
    await distributor.connect(owner).setRecyclingCompany(company.address, true);

    // Register a center wallet
    await distributor.connect(owner).registerCenterWallet(CENTER_ID, centerWallet.address);
  });

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores the token address", async function () {
      expect(await distributor.token()).to.equal(await token.getAddress());
    });

    it("initial tokensPerKg is 10 WWT", async function () {
      expect(await distributor.tokensPerKg()).to.equal(ethers.parseEther("10"));
    });

    it("IMMEDIATE_PERCENT is 70", async function () {
      expect(await distributor.IMMEDIATE_PERCENT()).to.equal(70n);
    });

    it("PENDING_PERCENT is 30", async function () {
      expect(await distributor.PENDING_PERCENT()).to.equal(30n);
    });

    it("sets the owner correctly", async function () {
      expect(await distributor.owner()).to.equal(owner.address);
    });
  });

  // ── Admin ────────────────────────────────────────────────────────────────────

  describe("Admin functions", function () {
    describe("setTokensPerKg", function () {
      it("owner can update the rate", async function () {
        const newRate = ethers.parseEther("20");
        await distributor.connect(owner).setTokensPerKg(newRate);
        expect(await distributor.tokensPerKg()).to.equal(newRate);
      });

      it("emits RewardRateUpdated", async function () {
        const oldRate = ethers.parseEther("10");
        const newRate = ethers.parseEther("15");
        await expect(distributor.connect(owner).setTokensPerKg(newRate))
          .to.emit(distributor, "RewardRateUpdated")
          .withArgs(oldRate, newRate);
      });

      it("reverts for non-owner", async function () {
        await expect(
          distributor.connect(other).setTokensPerKg(ethers.parseEther("5"))
        ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
      });
    });

    describe("setVerifier", function () {
      it("owner can add a verifier", async function () {
        await distributor.connect(owner).setVerifier(other.address, true);
        expect(await distributor.authorizedVerifiers(other.address)).to.be.true;
      });

      it("owner can remove a verifier", async function () {
        await distributor.connect(owner).setVerifier(verifier.address, false);
        expect(await distributor.authorizedVerifiers(verifier.address)).to.be.false;
      });

      it("emits VerifierUpdated", async function () {
        await expect(distributor.connect(owner).setVerifier(other.address, true))
          .to.emit(distributor, "VerifierUpdated")
          .withArgs(other.address, true);
      });

      it("reverts for non-owner", async function () {
        await expect(
          distributor.connect(other).setVerifier(other.address, true)
        ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
      });

      it("reverts on zero address", async function () {
        await expect(
          distributor.connect(owner).setVerifier(ethers.ZeroAddress, true)
        ).to.be.revertedWithCustomError(distributor, "ZeroAddress");
      });
    });

    describe("setRecyclingCompany", function () {
      it("owner can add a company", async function () {
        await distributor.connect(owner).setRecyclingCompany(other.address, true);
        expect(await distributor.authorizedCompanies(other.address)).to.be.true;
      });

      it("owner can remove a company", async function () {
        await distributor.connect(owner).setRecyclingCompany(company.address, false);
        expect(await distributor.authorizedCompanies(company.address)).to.be.false;
      });

      it("emits CompanyUpdated", async function () {
        await expect(
          distributor.connect(owner).setRecyclingCompany(other.address, true)
        )
          .to.emit(distributor, "CompanyUpdated")
          .withArgs(other.address, true);
      });

      it("reverts for non-owner", async function () {
        await expect(
          distributor.connect(other).setRecyclingCompany(other.address, true)
        ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
      });

      it("reverts on zero address", async function () {
        await expect(
          distributor.connect(owner).setRecyclingCompany(ethers.ZeroAddress, true)
        ).to.be.revertedWithCustomError(distributor, "ZeroAddress");
      });
    });

    describe("registerCenterWallet", function () {
      it("owner can register a center wallet", async function () {
        await distributor.connect(owner).registerCenterWallet(99n, other.address);
        expect(await distributor.centerWallets(99n)).to.equal(other.address);
      });

      it("emits CenterWalletRegistered", async function () {
        await expect(
          distributor.connect(owner).registerCenterWallet(99n, other.address)
        )
          .to.emit(distributor, "CenterWalletRegistered")
          .withArgs(99n, other.address);
      });

      it("reverts for non-owner", async function () {
        await expect(
          distributor.connect(other).registerCenterWallet(99n, other.address)
        ).to.be.revertedWithCustomError(distributor, "OwnableUnauthorizedAccount");
      });

      it("reverts on zero wallet address", async function () {
        await expect(
          distributor.connect(owner).registerCenterWallet(99n, ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(distributor, "ZeroAddress");
      });
    });
  });

  // ── issuePartialReward ───────────────────────────────────────────────────────

  describe("issuePartialReward", function () {
    const WEIGHT_GRAMS = 500; // 0.5 kg → 5 WWT total

    it("only an authorized verifier can call", async function () {
      await expect(
        distributor
          .connect(other)
          .issuePartialReward(sid("s1"), user.address, WEIGHT_GRAMS)
      ).to.be.revertedWithCustomError(distributor, "NotAuthorizedVerifier");
    });

    it("mints exactly 70 % to recipient immediately", async function () {
      const total = expectedTotal(WEIGHT_GRAMS);
      const imm   = immediate(total);

      await distributor
        .connect(verifier)
        .issuePartialReward(sid("s2"), user.address, WEIGHT_GRAMS);

      expect(await token.balanceOf(user.address)).to.equal(imm);
    });

    it("stores exactly 30 % in pending rewards", async function () {
      const total  = expectedTotal(WEIGHT_GRAMS);
      const pend   = pending(total);
      const id     = sid("s3");

      await distributor
        .connect(verifier)
        .issuePartialReward(id, user.address, WEIGHT_GRAMS);

      const [, amount] = await distributor.getPendingReward(id);
      expect(amount).to.equal(pend);
    });

    it("marks submission as processed", async function () {
      const id = sid("s4");
      await distributor
        .connect(verifier)
        .issuePartialReward(id, user.address, WEIGHT_GRAMS);
      expect(await distributor.processedSubmissions(id)).to.be.true;
    });

    it("emits PartialRewardIssued with correct args", async function () {
      const id    = sid("s5");
      const total = expectedTotal(WEIGHT_GRAMS);
      const imm   = immediate(total);
      const pend  = pending(total);

      await expect(
        distributor
          .connect(verifier)
          .issuePartialReward(id, user.address, WEIGHT_GRAMS)
      )
        .to.emit(distributor, "PartialRewardIssued")
        .withArgs(id, user.address, imm, pend);
    });

    it("reverts on duplicate submission", async function () {
      const id = sid("s6");
      await distributor
        .connect(verifier)
        .issuePartialReward(id, user.address, WEIGHT_GRAMS);

      await expect(
        distributor
          .connect(verifier)
          .issuePartialReward(id, user.address, WEIGHT_GRAMS)
      ).to.be.revertedWithCustomError(distributor, "AlreadyProcessed");
    });

    it("reverts on zero weight", async function () {
      await expect(
        distributor
          .connect(verifier)
          .issuePartialReward(sid("s7"), user.address, 0)
      ).to.be.revertedWithCustomError(distributor, "ZeroWeight");
    });

    it("reverts on zero address recipient", async function () {
      await expect(
        distributor
          .connect(verifier)
          .issuePartialReward(sid("s8"), ethers.ZeroAddress, WEIGHT_GRAMS)
      ).to.be.revertedWithCustomError(distributor, "ZeroAddress");
    });
  });

  // ── releaseFinalReward ───────────────────────────────────────────────────────

  describe("releaseFinalReward", function () {
    const WEIGHT_GRAMS = 1000; // 1 kg → 10 WWT total
    let submissionId;

    beforeEach(async function () {
      submissionId = sid("release-flow");
      await distributor
        .connect(verifier)
        .issuePartialReward(submissionId, user.address, WEIGHT_GRAMS);
    });

    it("only an authorized company can call", async function () {
      await expect(
        distributor.connect(other).releaseFinalReward(submissionId)
      ).to.be.revertedWithCustomError(distributor, "NotAuthorizedCompany");
    });

    it("mints the correct 30 % pending amount to recipient", async function () {
      const total   = expectedTotal(WEIGHT_GRAMS);
      const pend    = pending(total);
      const before  = await token.balanceOf(user.address);

      await distributor.connect(company).releaseFinalReward(submissionId);

      expect(await token.balanceOf(user.address)).to.equal(before + pend);
    });

    it("emits FinalRewardReleased with correct args", async function () {
      const total = expectedTotal(WEIGHT_GRAMS);
      const pend  = pending(total);

      await expect(
        distributor.connect(company).releaseFinalReward(submissionId)
      )
        .to.emit(distributor, "FinalRewardReleased")
        .withArgs(submissionId, user.address, pend);
    });

    it("marks the pending reward as released", async function () {
      await distributor.connect(company).releaseFinalReward(submissionId);
      const [,, released] = await distributor.getPendingReward(submissionId);
      expect(released).to.be.true;
    });

    it("reverts on double-release", async function () {
      await distributor.connect(company).releaseFinalReward(submissionId);
      await expect(
        distributor.connect(company).releaseFinalReward(submissionId)
      ).to.be.revertedWithCustomError(distributor, "RewardAlreadyReleased");
    });

    it("reverts on non-existent submission", async function () {
      await expect(
        distributor.connect(company).releaseFinalReward(sid("does-not-exist"))
      ).to.be.revertedWithCustomError(distributor, "RewardNotFound");
    });
  });

  // ── batchIssueRewards ────────────────────────────────────────────────────────

  describe("batchIssueRewards", function () {
    const weights = [500, 1000, 750]; // grams

    function buildBatch(labels) {
      return labels.map((l) => sid(l));
    }

    it("only an authorized verifier can call", async function () {
      await expect(
        distributor
          .connect(other)
          .batchIssueRewards(CENTER_ID, buildBatch(["b1"]), [500])
      ).to.be.revertedWithCustomError(distributor, "NotAuthorizedVerifier");
    });

    it("mints the correct total to the center wallet", async function () {
      const ids = buildBatch(["c1", "c2", "c3"]);
      const expectedSum = weights.reduce(
        (acc, w) => acc + expectedTotal(w),
        0n
      );

      await distributor
        .connect(verifier)
        .batchIssueRewards(CENTER_ID, ids, weights);

      expect(await token.balanceOf(centerWallet.address)).to.equal(expectedSum);
    });

    it("marks all batch submissions as processed", async function () {
      const ids = buildBatch(["d1", "d2", "d3"]);
      await distributor
        .connect(verifier)
        .batchIssueRewards(CENTER_ID, ids, weights);

      for (const id of ids) {
        expect(await distributor.processedSubmissions(id)).to.be.true;
      }
    });

    it("emits BatchRewardIssued with count of processed submissions", async function () {
      const ids = buildBatch(["e1", "e2", "e3"]);
      const expectedSum = weights.reduce(
        (acc, w) => acc + expectedTotal(w),
        0n
      );

      await expect(
        distributor.connect(verifier).batchIssueRewards(CENTER_ID, ids, weights)
      )
        .to.emit(distributor, "BatchRewardIssued")
        .withArgs(CENTER_ID, centerWallet.address, expectedSum, 3n);
    });

    it("skips already-processed submissions and only mints for new ones", async function () {
      const ids = buildBatch(["f1", "f2", "f3"]);

      // Process the first submission individually
      await distributor
        .connect(verifier)
        .issuePartialReward(ids[0], user.address, weights[0]);

      const balanceBefore = await token.balanceOf(centerWallet.address);

      // Batch includes the already-processed id[0] — it should be skipped
      await distributor
        .connect(verifier)
        .batchIssueRewards(CENTER_ID, ids, weights);

      const expectedNew = expectedTotal(weights[1]) + expectedTotal(weights[2]);
      expect(await token.balanceOf(centerWallet.address)).to.equal(
        balanceBefore + expectedNew
      );
    });

    it("reverts if the center wallet is not registered", async function () {
      const unregisteredCenter = 999n;
      await expect(
        distributor
          .connect(verifier)
          .batchIssueRewards(unregisteredCenter, buildBatch(["g1"]), [500])
      ).to.be.revertedWithCustomError(distributor, "CenterWalletNotRegistered");
    });

    it("reverts on an empty batch", async function () {
      await expect(
        distributor.connect(verifier).batchIssueRewards(CENTER_ID, [], [])
      ).to.be.revertedWithCustomError(distributor, "EmptyBatch");
    });
  });

  // ── calculateReward ──────────────────────────────────────────────────────────

  describe("calculateReward", function () {
    const cases = [
      { grams: 1000, desc: "1 kg"    },
      { grams: 500,  desc: "0.5 kg"  },
      { grams: 250,  desc: "250 g"   },
      { grams: 100,  desc: "100 g"   },
      { grams: 2500, desc: "2.5 kg"  },
    ];

    for (const { grams, desc } of cases) {
      it(`correct math for ${desc} (${grams} g)`, async function () {
        const [total, imm, pend] = await distributor.calculateReward(grams);

        const expTotal = expectedTotal(grams);
        const expImm   = immediate(expTotal);
        const expPend  = pending(expTotal);

        expect(total).to.equal(expTotal, "total");
        expect(imm).to.equal(expImm,   "immediate");
        expect(pend).to.equal(expPend,  "pending");
        expect(imm + pend).to.equal(total, "immediate + pending == total");
      });
    }

    it("returns zero for zero grams", async function () {
      const [total, imm, pend] = await distributor.calculateReward(0);
      expect(total).to.equal(0n);
      expect(imm).to.equal(0n);
      expect(pend).to.equal(0n);
    });
  });

  // ── Full flow ─────────────────────────────────────────────────────────────────

  describe("Full flow: issuePartialReward → releaseFinalReward", function () {
    it("balances add up to exactly 100 % after both steps", async function () {
      const WEIGHT = 1337; // arbitrary grams
      const id     = sid("full-flow-1337");

      const total = expectedTotal(WEIGHT);
      const imm   = immediate(total);
      const pend  = pending(total);

      // Step 1 — verifier issues 70 %
      await distributor
        .connect(verifier)
        .issuePartialReward(id, user.address, WEIGHT);

      expect(await token.balanceOf(user.address)).to.equal(imm);

      const [recipient, pendingAmt, released] =
        await distributor.getPendingReward(id);

      expect(recipient).to.equal(user.address);
      expect(pendingAmt).to.equal(pend);
      expect(released).to.be.false;

      // Step 2 — company releases remaining 30 %
      await distributor.connect(company).releaseFinalReward(id);

      expect(await token.balanceOf(user.address)).to.equal(total);
      expect(await token.totalSupply()).to.equal(total);

      const [,, releasedAfter] = await distributor.getPendingReward(id);
      expect(releasedAfter).to.be.true;
    });

    it("immediate + pending equals calculated total for large weight", async function () {
      const WEIGHT = 50000; // 50 kg
      const id     = sid("full-flow-50kg");

      await distributor
        .connect(verifier)
        .issuePartialReward(id, user.address, WEIGHT);

      await distributor.connect(company).releaseFinalReward(id);

      const expTotal = expectedTotal(WEIGHT);
      expect(await token.balanceOf(user.address)).to.equal(expTotal);
    });

    it("getPendingReward returns correct recipient after issuePartialReward", async function () {
      const id = sid("recipient-check");
      await distributor
        .connect(verifier)
        .issuePartialReward(id, user.address, 1000);

      const [recipient] = await distributor.getPendingReward(id);
      expect(recipient).to.equal(user.address);
    });
  });
});
