// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./WasteToken.sol";

/// @title RewardDistributor — core reward engine for the WasteWise platform
/// @notice Verifiers issue partial (70 %) rewards immediately after a waste
///         drop-off is recorded on-chain.  Recycling companies release the
///         remaining (30 %) once the batch has been processed at the facility.
///         A batch path lets verifiers mint rewards for an entire recycling
///         centre in a single transaction.
contract RewardDistributor is ReentrancyGuard, Ownable {
    // ─── Types ────────────────────────────────────────────────────────────────

    struct PendingReward {
        address recipient;
        uint256 amount;   // the 30 % portion (in token wei)
        bool    exists;
        bool    released;
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Percentage of the total reward minted immediately upon submission.
    uint256 public constant IMMEDIATE_PERCENT = 70;

    /// @notice Percentage held in escrow until the company confirms processing.
    uint256 public constant PENDING_PERCENT   = 30;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The WWT token contract used for all minting.
    WasteToken public immutable token;

    /// @notice Reward rate: how many WWT tokens (in wei) are awarded per kg.
    ///         Default: 10 WWT per kg.
    uint256 public tokensPerKg = 10 * 10 ** 18;

    /// @notice Tracks which submission IDs have already been processed so they
    ///         cannot be double-counted.
    mapping(bytes32 => bool)          public processedSubmissions;

    /// @notice Holds the 30 % pending portion for each submission.
    mapping(bytes32 => PendingReward) public pendingRewards;

    /// @notice Addresses allowed to call issuePartialReward / batchIssueRewards.
    mapping(address => bool)          public authorizedVerifiers;

    /// @notice Addresses allowed to call releaseFinalReward.
    mapping(address => bool)          public authorizedCompanies;

    /// @notice Maps a recycling-centre ID to its custodial wallet address.
    mapping(uint256 => address)       public centerWallets;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PartialRewardIssued(
        bytes32 indexed submissionId,
        address indexed recipient,
        uint256 immediateAmount,
        uint256 pendingAmount
    );

    event FinalRewardReleased(
        bytes32 indexed submissionId,
        address indexed recipient,
        uint256 amount
    );

    event BatchRewardIssued(
        uint256 indexed centerId,
        address indexed centerWallet,
        uint256 totalAmount,
        uint256 submissionsProcessed
    );

    event VerifierUpdated(address indexed verifier, bool authorised);
    event CompanyUpdated(address indexed company,  bool authorised);
    event CenterWalletRegistered(uint256 indexed centerId, address wallet);
    event RewardRateUpdated(uint256 previousRate, uint256 newRate);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAuthorizedVerifier();
    error NotAuthorizedCompany();
    error AlreadyProcessed(bytes32 submissionId);
    error ZeroWeight();
    error ZeroAddress();
    error RewardNotFound(bytes32 submissionId);
    error RewardAlreadyReleased(bytes32 submissionId);
    error CenterWalletNotRegistered(uint256 centerId);
    error EmptyBatch();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param tokenAddress Address of the deployed WasteToken contract.
    /// @param initialOwner Address that will own this contract.
    constructor(address tokenAddress, address initialOwner) Ownable(initialOwner) {
        if (tokenAddress == address(0)) revert ZeroAddress();
        token = WasteToken(tokenAddress);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Update the reward rate. Only callable by owner.
    /// @param newRate New tokens-per-kg value (in token wei).
    function setTokensPerKg(uint256 newRate) external onlyOwner {
        uint256 previous = tokensPerKg;
        tokensPerKg = newRate;
        emit RewardRateUpdated(previous, newRate);
    }

    /// @notice Grant or revoke verifier privileges for an address.
    function setVerifier(address verifier, bool authorised) external onlyOwner {
        if (verifier == address(0)) revert ZeroAddress();
        authorizedVerifiers[verifier] = authorised;
        emit VerifierUpdated(verifier, authorised);
    }

    /// @notice Grant or revoke recycling-company privileges for an address.
    function setRecyclingCompany(address company, bool authorised) external onlyOwner {
        if (company == address(0)) revert ZeroAddress();
        authorizedCompanies[company] = authorised;
        emit CompanyUpdated(company, authorised);
    }

    /// @notice Register (or update) the custodial wallet for a recycling centre.
    function registerCenterWallet(uint256 centerId, address wallet) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        centerWallets[centerId] = wallet;
        emit CenterWalletRegistered(centerId, wallet);
    }

    // ─── Core — individual submission ─────────────────────────────────────────

    /// @notice Issue a partial (70 %) reward for a single waste submission.
    ///         The remaining 30 % is stored in escrow until the company
    ///         confirms processing via releaseFinalReward.
    ///
    /// @param submissionId Unique identifier for this waste drop-off record.
    /// @param recipient    User wallet that should receive the reward.
    /// @param weightGrams  Weight of the waste in grams.
    function issuePartialReward(
        bytes32 submissionId,
        address recipient,
        uint256 weightGrams
    ) external nonReentrant {
        if (!authorizedVerifiers[msg.sender]) revert NotAuthorizedVerifier();
        if (processedSubmissions[submissionId])  revert AlreadyProcessed(submissionId);
        if (weightGrams == 0)                    revert ZeroWeight();
        if (recipient   == address(0))           revert ZeroAddress();

        // ── Effects ──────────────────────────────────────────────────────────
        processedSubmissions[submissionId] = true;

        (uint256 total, uint256 immediate, uint256 pending) =
            calculateReward(weightGrams);

        pendingRewards[submissionId] = PendingReward({
            recipient: recipient,
            amount:    pending,
            exists:    true,
            released:  false
        });

        // ── Interactions ─────────────────────────────────────────────────────
        token.mint(recipient, immediate);

        emit PartialRewardIssued(submissionId, recipient, immediate, pending);

        // suppress "unused variable" warning — total is emitted implicitly via
        // immediate + pending but kept in the tuple for external callers.
        total;
    }

    /// @notice Release the escrowed 30 % portion of a reward once the recycling
    ///         company has confirmed that the waste batch was processed.
    ///
    /// @param submissionId The same ID used in issuePartialReward.
    function releaseFinalReward(bytes32 submissionId) external nonReentrant {
        if (!authorizedCompanies[msg.sender]) revert NotAuthorizedCompany();

        PendingReward storage reward = pendingRewards[submissionId];
        if (!reward.exists)   revert RewardNotFound(submissionId);
        if (reward.released)  revert RewardAlreadyReleased(submissionId);

        // ── Effects (checks-effects-interactions) ─────────────────────────────
        reward.released = true;

        address recipient = reward.recipient;
        uint256 amount    = reward.amount;

        // ── Interactions ─────────────────────────────────────────────────────
        token.mint(recipient, amount);

        emit FinalRewardReleased(submissionId, recipient, amount);
    }

    // ─── Core — batch submission ───────────────────────────────────────────────

    /// @notice Issue rewards for multiple submissions belonging to one recycling
    ///         centre in a single transaction.  All tokens go to the centre's
    ///         registered custodial wallet.  Already-processed submissions are
    ///         silently skipped so partial batches can be retried.
    ///
    /// @param centerId       ID of the recycling centre.
    /// @param submissionIds  Array of unique submission identifiers.
    /// @param weightsGrams   Parallel array of weights (grams) for each submission.
    function batchIssueRewards(
        uint256        centerId,
        bytes32[] calldata submissionIds,
        uint256[] calldata weightsGrams
    ) external nonReentrant {
        if (!authorizedVerifiers[msg.sender]) revert NotAuthorizedVerifier();
        if (submissionIds.length == 0)        revert EmptyBatch();

        address centerWallet = centerWallets[centerId];
        if (centerWallet == address(0)) revert CenterWalletNotRegistered(centerId);

        uint256 totalAmount       = 0;
        uint256 submissionsCount  = 0;

        for (uint256 i = 0; i < submissionIds.length; i++) {
            bytes32 sid = submissionIds[i];

            // Skip duplicates gracefully so the caller can retry batches
            if (processedSubmissions[sid]) continue;

            uint256 wg = weightsGrams[i];
            if (wg == 0) continue; // skip zero-weight entries

            processedSubmissions[sid] = true;

            (uint256 total,,) = calculateReward(wg);
            totalAmount      += total;
            submissionsCount += 1;
        }

        if (totalAmount > 0) {
            token.mint(centerWallet, totalAmount);
        }

        emit BatchRewardIssued(centerId, centerWallet, totalAmount, submissionsCount);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// @notice Calculate the reward breakdown for a given weight.
    /// @param weightGrams Weight in grams.
    /// @return total     Total WWT (wei) that would be awarded.
    /// @return immediate The 70 % portion minted right away.
    /// @return pending   The 30 % portion held in escrow.
    function calculateReward(uint256 weightGrams)
        public
        view
        returns (uint256 total, uint256 immediate, uint256 pending)
    {
        // tokensPerKg is denominated per 1 000 grams
        total     = (weightGrams * tokensPerKg) / 1000;
        immediate = (total * IMMEDIATE_PERCENT) / 100;
        pending   = total - immediate; // avoids rounding loss
    }

    /// @notice Retrieve details of a pending (escrowed) reward.
    /// @param submissionId The submission to query.
    /// @return recipient The user that will receive the pending tokens.
    /// @return amount    The escrowed token amount (wei).
    /// @return released  Whether the funds have already been released.
    function getPendingReward(bytes32 submissionId)
        external
        view
        returns (address recipient, uint256 amount, bool released)
    {
        PendingReward storage reward = pendingRewards[submissionId];
        return (reward.recipient, reward.amount, reward.released);
    }
}
