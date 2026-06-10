// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FrozenFriends is ERC721, Ownable {
    uint256 public constant MINT_PRICE = 0.0005 ether;
    uint256 public nextTokenId = 1;
    string private _baseTokenURI;

    mapping(address => bool) public hasMinted;
    mapping(uint256 => uint256) public seedOf;

    event Minted(address indexed owner, uint256 indexed tokenId, uint256 seed);

    error AlreadyMinted();
    error InsufficientPayment();
    error WithdrawFailed();

    constructor(string memory baseURI_) ERC721("FrozenFriends", "FROZE") Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
    }

    function mint() external payable returns (uint256 tokenId) {
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (msg.value < MINT_PRICE) revert InsufficientPayment();

        hasMinted[msg.sender] = true;
        tokenId = nextTokenId++;
        uint256 seed = uint256(keccak256(abi.encodePacked(block.prevrandao, msg.sender, tokenId)));
        seedOf[tokenId] = seed;

        _safeMint(msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, seed);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }
}
