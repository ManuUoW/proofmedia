// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MediaProof
 * @notice On-chain registry for ProofMedia — stores content hashes, location hashes,
 *         and authenticity scores for KYC-verified media captures.
 * @dev Deploy to Polygon Amoy (testnet) or Polygon PoS (mainnet).
 *      Only the owner (deployer) can register proofs — the server acts as an oracle.
 */
contract MediaProof {
    struct Proof {
        bytes32 contentHash;
        bytes32 metadataHash;
        bytes32 locationHash;
        string  geohash;
        uint256 authenticityScore;  // 0-100
        string  ipfsCid;
        address uploaderWallet;
        uint256 timestamp;
        bool    exists;
    }

    address public owner;
    uint256 public proofCount;

    // contentHash => Proof
    mapping(bytes32 => Proof) public proofs;
    // Sequential index => contentHash (for enumeration)
    mapping(uint256 => bytes32) public proofIndex;

    event ProofRegistered(
        bytes32 indexed contentHash,
        address indexed uploader,
        string geohash,
        uint256 authenticityScore,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Register a new media proof on-chain.
     * @param _contentHash SHA-256 hash of the media content
     * @param _metadataHash SHA-256 hash of device + location metadata
     * @param _locationHash SHA-256 hash of geohash + timestamp
     * @param _geohash Geohash string of capture location
     * @param _authenticityScore AI detection score (0-100)
     * @param _ipfsCid IPFS CID for the stored media
     * @param _uploaderWallet Wallet address of the KYC-verified uploader
     */
    function registerProof(
        bytes32 _contentHash,
        bytes32 _metadataHash,
        bytes32 _locationHash,
        string calldata _geohash,
        uint256 _authenticityScore,
        string calldata _ipfsCid,
        address _uploaderWallet
    ) external onlyOwner {
        require(!proofs[_contentHash].exists, "Proof already exists");
        require(_authenticityScore <= 100, "Score must be 0-100");

        proofs[_contentHash] = Proof({
            contentHash: _contentHash,
            metadataHash: _metadataHash,
            locationHash: _locationHash,
            geohash: _geohash,
            authenticityScore: _authenticityScore,
            ipfsCid: _ipfsCid,
            uploaderWallet: _uploaderWallet,
            timestamp: block.timestamp,
            exists: true
        });

        proofIndex[proofCount] = _contentHash;
        proofCount++;

        emit ProofRegistered(
            _contentHash,
            _uploaderWallet,
            _geohash,
            _authenticityScore,
            block.timestamp
        );
    }

    /**
     * @notice Verify a content hash exists on-chain.
     */
    function verify(bytes32 _contentHash) external view returns (
        bool exists,
        uint256 authenticityScore,
        string memory geohash,
        address uploaderWallet,
        uint256 timestamp,
        string memory ipfsCid
    ) {
        Proof storage p = proofs[_contentHash];
        return (p.exists, p.authenticityScore, p.geohash, p.uploaderWallet, p.timestamp, p.ipfsCid);
    }

    /**
     * @notice Get proof by sequential index.
     */
    function getProofByIndex(uint256 index) external view returns (Proof memory) {
        require(index < proofCount, "Index out of bounds");
        return proofs[proofIndex[index]];
    }
}
