// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract QuizRewards is ERC721, ERC721URIStorage, ERC721Burnable, Ownable {
    uint256 private _nextTokenId;

    // Structs matching ABI tuples
    struct QuizCompletion {
        address player;
        uint256 timestamp;
        uint256 score;
        string quizId;
        uint256 attempts;
    }

    struct QuizData {
        string title;
        string nftMetadata;
        bool exists;
    }

    // State Variables
    mapping(string => QuizData) public quizzes;
    mapping(address => mapping(string => QuizCompletion)) public quizCompletions;
    QuizCompletion[] public allCompletions;

    // Events
    event CheckedIn(address indexed user, uint256 timestamp);
    event QuizCreated(string indexed quizId, string title, string nftMetadata);
    event QuizCompleted(address indexed user, string indexed quizId, uint256 score, uint256 timestamp, uint256 attempts);
    event NFTRewardClaimed(address indexed user, string indexed quizId, uint256 tokenId);

    constructor() ERC721("KnowIt?", "KNW") Ownable(msg.sender) {}

    // --- Core Logic ---

    function createQuiz(string memory quizId, string memory title, string memory nftMetadata) public {
        require(!quizzes[quizId].exists, "Quiz already exists");
        
        quizzes[quizId] = QuizData({
            title: title,
            nftMetadata: nftMetadata,
            exists: true
        });

        emit QuizCreated(quizId, title, nftMetadata);
    }

    function checkIn() public {
        // Logic for daily rewards points could be added here
        emit CheckedIn(msg.sender, block.timestamp);
    }

    function recordQuizCompletion(string memory quizId, uint256 score, uint256 attempts) public {
        require(quizzes[quizId].exists, "Quiz does not exist");
        
        // Create completion record
        QuizCompletion memory newCompletion = QuizCompletion({
            player: msg.sender,
            timestamp: block.timestamp,
            score: score,
            quizId: quizId,
            attempts: attempts
        });

        // Store in mapping for quick lookup of user's latest attempt
        quizCompletions[msg.sender][quizId] = newCompletion;
        
        // Store in array for leaderboard history
        allCompletions.push(newCompletion);

        emit QuizCompleted(msg.sender, quizId, score, block.timestamp, attempts);
    }

    function claimNFTReward(string memory quizId) public {
        require(quizzes[quizId].exists, "Quiz does not exist");
        
        // Verify the user has actually completed the quiz
        // In a strict version, you might check if score == maxScore here
        require(quizCompletions[msg.sender][quizId].timestamp > 0, "Quiz not completed by user");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, quizzes[quizId].nftMetadata);

        emit NFTRewardClaimed(msg.sender, quizId, tokenId);
    }

    // --- View Functions ---

    function hasCompletedQuiz(address user, string memory quizId) public view returns (bool) {
        return quizCompletions[user][quizId].timestamp > 0;
    }

    function getLeaderboard(string memory quizId) public view returns (QuizCompletion[] memory) {
        // Count matching items first
        uint256 count = 0;
        for (uint256 i = 0; i < allCompletions.length; i++) {
            // String comparison
            if (keccak256(abi.encodePacked(allCompletions[i].quizId)) == keccak256(abi.encodePacked(quizId))) {
                count++;
            }
        }

        // Create result array
        QuizCompletion[] memory result = new QuizCompletion[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < allCompletions.length; i++) {
            if (keccak256(abi.encodePacked(allCompletions[i].quizId)) == keccak256(abi.encodePacked(quizId))) {
                result[currentIndex] = allCompletions[i];
                currentIndex++;
            }
        }
        return result;
    }

    function getPlayerQuizCompletions(address player) public view returns (QuizCompletion[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < allCompletions.length; i++) {
            if (allCompletions[i].player == player) {
                count++;
            }
        }

        QuizCompletion[] memory result = new QuizCompletion[](count);
        uint256 currentIndex = 0;
        for (uint256 i = 0; i < allCompletions.length; i++) {
            if (allCompletions[i].player == player) {
                result[currentIndex] = allCompletions[i];
                currentIndex++;
            }
        }
        return result;
    }

    // --- Overrides required by Solidity ---

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}