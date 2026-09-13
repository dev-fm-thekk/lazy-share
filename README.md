<img width="1280" height="640" alt="git (1)" src="https://github.com/user-attachments/assets/8920b256-2ba8-4988-b824-5351134eb4bd" />

# Lazy Share 🎯


## Basic Details
### Team Name: lazy-coder


### Team Members
- Team Lead: Abhiram A R - SCT College of Engineering

### Project Description
You know how apps like Quick Share work — the closer your devices, the faster the transfer. LazyShare does the opposite. Get too close, and it pauses. Step away, and it speeds back up.

### The Problem (that doesn't exist)
Every file transfer app on the market is obsessed with speed. Get close, go fast. It's efficient. It's convenient. It's boring. Worse — it means the person sending you a file gets to leave the moment the progress bar hits 100%, no small talk required. Modern technology, optimizing us out of standing near each other. Someone had to ask: what if it didn't? 

### The Solution (that nobody asked for)
LazyShare inverts the entire premise of proximity-based sharing. Walk up to send a file, and it stops dead — too close, access denied. Back away, and it speeds right up, rewarding distance instead of punishing it. The only way to get your file across quickly is to not be near the person sending it. Efficient? No. Physically demanding? A little. Exactly what you signed up for? Also no.

## Technical Details
### Technologies/Components Used
For Software:
- Typescript
- Expo

### Implementation
For Software:
LazyShare discovers nearby devices over local Wi-Fi (via mDNS/Zeroconf) and transfers files between them over a raw TCP socket, chunked and length-prefixed, with a JSON handshake and completion message; its gimmick is that a BLE RSSI scan estimates distance to the receiving device in real time, and the transfer deliberately pauses when devices are too close and speeds back up as they move apart — the opposite of how proximity-based sharing apps like Quick Share normally behave — all wrapped in a single-page white-themed landing site (`index.html`) with playful copy explaining the pointless mechanic and a GitHub-linked, APK-download call to action ready to deploy via GitHub Pages once the release URL and checksum verification are filled in.

# Installation

Clone repository
```bash
git clone https://github.com/dev-fm-thekk/lazy-share
cd lazy-share
npm install
```

# Run
```bash
npx expo start
```

### Project Documentation
For Software:

# Screenshots (Add at least 3)
![Screenshot1](Add screenshot 1 here with proper name)
*Add caption explaining what this shows*

![Screenshot2](Add screenshot 2 here with proper name)
*Add caption explaining what this shows*

![Screenshot3](Add screenshot 3 here with proper name)
*Add caption explaining what this shows*

# Diagrams
![Workflow](Add your workflow/architecture diagram here)
*Add caption explaining your workflow*

### Project Demo
# Video
[Add your demo video link here]
*Explain what the video demonstrates*

# Additional Demos
[Add any extra demo materials/links]

## Team Contributions
- [Name 1]: [Specific contributions]
- [Name 2]: [Specific contributions]
- [Name 3]: [Specific contributions]

---
Made with ❤️ at TinkerHub Useless Projects 

![Static Badge](https://img.shields.io/badge/TinkerHub-24?color=%23000000&link=https%3A%2F%2Fwww.tinkerhub.org%2F)
![Static Badge](https://img.shields.io/badge/UselessProjects--26-26?link=https%3A%2F%2Ftinkerhub.org%2Fevents%2F1M8ORET9A1%2Fuseless-projects-3.0)



