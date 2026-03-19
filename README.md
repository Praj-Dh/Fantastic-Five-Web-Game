<div align="center">
  <h1>🎮 Paint the Grid <br/> <sup>(Fantastic Five Web Game)</sup></h1>
  <p><strong>A real-time multiplayer territory control game on a shared 100×100 grid!</strong></p>
  
  [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
  [![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
  [![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
  [![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## 📌 Overview

**Paint the Grid** is a real-time multiplayer web game where players compete to control territory on a shared canvas. Move around the grid, claim tiles with your unique color, and dominate the leaderboard!

Built with a full-stack architecture, the game delivers live updates using WebSockets and provides persistent player data, achievements, and customizable profiles.

---

## ✨ Features

### 🟢 Real-Time Multiplayer
*   **Instant Movement:** Powered by Socket.IO for real-time synchronization.
*   **Shared Grid State:** Synchronized effortlessly across all connected players.

### 🎨 Territory Control
*   **Paint Tiles:** Move across the 100x100 grid to claim territory.
*   **Live Scoring:** Your score equals the number of tiles you currently own.

### 📊 Live Leaderboard & Stats
*   **Top Players:** Real-time leaderboard tracking the best players.
*   **Persistent Stats:** Track your *Max Score*, *Average Score*, and *Total Games Played*.

### 🏆 Achievements
Unlock milestone trophies at:
*   🥉 **50 points**
*   🥈 **100 points**
*   🥇 **200 points**

### 👤 Player Profiles
*   Create accounts securely and log in.
*   Upload custom avatars to personalize your in-game identity.

---

## 🛠️ Tech Stack

**Frontend**
*   [React](https://reactjs.org/) (built with [Vite](https://vitejs.dev/))
*   [Socket.IO Client](https://socket.io/)
*   HTML5 Canvas API

**Backend**
*   [Python](https://www.python.org/) & [Flask](https://flask.palletsprojects.com/)
*   [Flask-SocketIO](https://flask-socketio.readthedocs.io/)

**Database & Infrastructure**
*   [MongoDB](https://www.mongodb.com/)
*   [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
*   [Nginx](https://www.nginx.com/) (Reverse Proxy)

---

## 🚀 Getting Started

### Prerequisites
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker + Docker Compose)

### Run Locally

1. **Clone the repository:**
   ```bash
   git clone git@github.com:Praj-Dh/Fantastic-Five-Web-Game.git
   cd Fantastic-Five-Web-Game
   ```

2. **Start the application:**
   ```bash
   docker-compose up --build -d
   ```

3. **Open in browser:**
   Navigate to [http://localhost:8080](http://localhost:8080)

### ⚙️ Ports
*   **Frontend (Nginx):** `:8080`
*   **Backend (Flask):** `:5000` *(Internal)*
*   **MongoDB:** `:27017` *(Internal)*

---

<div align="center">
  <i>Developed for the Fantastic-Five project.</i>
</div>