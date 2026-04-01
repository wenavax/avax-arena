import { network } from "hardhat";

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();

const abi = [
  "function setFeeRecipient(address) external",
  "function feeRecipient() view returns (address)",
];
const contract = new ethers.Contract(
  "0xBe32e2C373C0F01FDA018772252C477fcf8aeFEb",
  abi,
  deployer
);

console.log("Current fee recipient:", await contract.feeRecipient());
const tx = await contract.setFeeRecipient(
  "0x301b013280317a75f808A3C0D23e82e9027A6b77"
);
console.log("TX:", tx.hash);
await tx.wait();
console.log("New fee recipient:", await contract.feeRecipient());
