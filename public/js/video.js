const authToken = "your-auth-token"; // Replace with your actual auth token
const query = new URLSearchParams(window.location.search);
let isJoined = false;
let showVideo = false;
let showCamera = false;
let showTextEditor = false;
let isStarted = false;
async function getMe() {
  const myData = await fetch("https://api.temanternak.h14.my.id/users/my", {
    headers: {
      Authorization: `Bearer ${query.get("token") || localStorage.getItem("token")}`,
    },
  });
  return (await myData.json()).data;
}
async function getConsultation() {
  const consultation = await fetch(`https://api.temanternak.h14.my.id/bookings/${query.get("id") || localStorage.getItem("id")}/consultations`, {
    headers: {
      Authorization: `Bearer ${query.get("token") || localStorage.getItem("token")}`,
      accept: "application/json",
    },
  });
  return (await consultation.json()).data;
}
const peers = new Map();
let localStream;
let roomId;
let localIsMuted = false;
let localIsVideoOn = true;
let socket;
let myData;
let consultation;
let lastReceivedMessageId = "";
const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:sip.temanternak.h14.my.id:3478",
      username: "temanternak",
      credential: "123123",
    },
  ],
};

async function joinRoom() {
  console.log("Join Room");

  console.log("consultation", consultation);
  try {
    socket = io("https://realtime.temanternak.h14.my.id/", {
      extraHeaders: {
        authorization: `bearer ${consultation.token}`,
      },
    });
    lastReceivedMessageId = "";
    // Join room
    isJoined = true;
    document.getElementById("messages").innerHTML = "";
    socket.on("user-connected", async (socketId, userId) => {
      console.log("User connected:", userId);
      const peerConnection = createPeerConnection(socketId, userId);
      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("offer", offer, roomId, socketId, localIsMuted, localIsVideoOn, query.get("token") || authToken);
    });
    socket.on("offer", async (offer, socketId, userId, isMuted, isVideoOn) => {
      const peerConnection = createPeerConnection(socketId, userId, isMuted, isVideoOn);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", answer, roomId, socketId, localIsMuted, localIsVideoOn);
    });
    socket.on("answer", async (answer, socketId, isMuted, isVideoOn) => {
      const peerConnection = peers.get(socketId);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
      const videoElement = document.querySelector(`#video-${socketId}`);
      if (videoElement) {
        videoElement.nextElementSibling.textContent = isMuted ? "Muted" : "Unmuted";
        videoElement.nextElementSibling.nextElementSibling.textContent = isVideoOn ? "Video On" : "Video Off";
      }
    });
    socket.on("ice-candidate", async (candidate, socketId) => {
      const peerConnection = peers.get(socketId);
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });
    socket.on("user-disconnected", (socketId, userId) => {
      const videoElement = document.getElementById(`video-${socketId}`);
      if (videoElement) {
        videoElement.parentElement.remove();
      }
      console.log("User disconnected:", socketId);
      if (peers.has(socketId)) {
        peers.get(socketId).close();
        peers.delete(socketId);
      }
    });
    socket.on("user-muted", (socketId, isMuted) => {
      const videoElement = document.getElementById(`video-${socketId}`);
      const statusElement = videoElement.nextElementSibling;

      statusElement.textContent = isMuted ? "Muted" : "Unmuted";
    });
    socket.on("user-video-toggled", (socketId, isVideoOn) => {
      const videoElement = document.getElementById(`video-${socketId}`);
      const statusElement = videoElement.nextElementSibling.nextElementSibling;
      statusElement.textContent = isVideoOn ? "Video On" : "Video Off";
    });
    socket.emit("join-room", query.get("token"), query.get("id"));

    // Replace join button with leave button
    // const joinButton = document.getElementById("joinBtn");
    // joinButton.textContent = "Leave Room";
    // joinButton.onclick = leaveRoom;
  } catch (err) {
    console.error("Error accessing media devices:", err);
  }

  // Mendengarkan pesan yang dikirim ke klien
  socket.on("receiveMessage", (message) => {
    console.log("receiveMessage", message);
    displayMessage(message);
    localStorage.setItem("lastReceivedMessageId", lastReceivedMessageId);
  });

  // Mendengarkan pesan lama saat pertama kali terhubung
  socket.on("previousMessages", (messages) => {
    messages.forEach((message) => {
      displayMessage(message);
    });
    localStorage.setItem("lastReceivedMessageId", lastReceivedMessageId);
  });

  // Mendengarkan pesan baru setelah reconnect
  socket.on("receiveNewMessages", (messages) => {
    messages.forEach((message) => {
      displayMessage(message);
    });
    localStorage.setItem("lastReceivedMessageId", lastReceivedMessageId);
  });

  // Kirim pesan baru
  function sendMessage(content) {
    console.log("sendMessage", content);
    const message = { message: content };
    socket.emit("sendMessage", message);
  }

  // Meminta pesan baru setelah reconnect
  function requestNewMessages() {
    socket.emit("getNewMessages", lastReceivedMessageId);
  }

  // Fungsi untuk menampilkan pesan di UI
  function displayMessage(msg) {
    if (msg.id > lastReceivedMessageId) {
      const messageElement = document.createElement("li");
      messageElement.className = "chat-bubble";
      if (msg.userId == myData.id) {
        messageElement.classList.add("right");
      } else {
        messageElement.classList.add("left");
      }
      console.log(messageElement);

      if (msg.message?.startsWith("WITHFILE:")) {
        const message = msg.message.split("END;");
        const fileUrl = message[0].replace("WITHFILE:", "");
        const messageContent = message[1];
        const img = document.createElement("img");
        img.src = `https://api.temanternak.h14.my.id/${fileUrl}`;
        img.style.width = "400px";
        img.style.maxWidth = "100%";
        const strong = document.createElement("strong");
        strong.textContent = `${myData.id == msg.userId ? `You (${myData.role == "veterinarian" ? consultation.veterinarianNameAndTitle : consultation.bookerName})` : myData.role == "veterinarian" ? consultation.bookerName : consultation.veterinarianNameAndTitle}`;
        messageElement.appendChild(strong);
        messageElement.appendChild(img);
        const p = document.createElement("p");
        p.textContent = `${messageContent}`;
        messageElement.appendChild(p);
        document.getElementById("messages").appendChild(messageElement);
      } else {
        const strong = document.createElement("strong");
        strong.textContent = `${myData.id == msg.userId ? `You (${myData.role == "veterinarian" ? consultation.veterinarianNameAndTitle : consultation.bookerName})` : myData.role == "veterinarian" ? consultation.bookerName : consultation.veterinarianNameAndTitle}`;
        const p = document.createElement("p");
        p.textContent = msg.message;
        messageElement.appendChild(strong);
        messageElement.appendChild(p);
        document.getElementById("messages").appendChild(messageElement);
      }
      lastReceivedMessageId = msg.id;
    }
  }

  const messageInput = document.getElementById("messageInput");
  const chatForm = document.getElementById("chatForm");

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    file = document.getElementById("fileInput").files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", "message-media");
    if (file && file.size > 0) {
      const uploadResponse = await fetch("https://api.temanternak.h14.my.id/users/my/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${query.get("token") || localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json();
        sendMessage(`WITHFILE:${uploadResult.data.pathname}END;${messageInput.value}`);
      } else {
        console.error("File upload failed");
      }
    } else {
      sendMessage(messageInput.value);
    }

    messageInput.value = "";
    file = null;
  });
  // Meminta pesan baru saat klien online kembali
  window.addEventListener("focus", () => {
    requestNewMessages();
  });
}

async function leaveRoom() {
  console.log("Leave Room");
  isJoined = false;

  // Close all peer connections
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  peers.forEach((peerConnection) => {
    peerConnection.close();
  });
  peers.clear();

  // Close socket connection

  document.querySelectorAll(".video-wrapper").forEach((video) => {
    if (!video.querySelector("#video-local")) video.remove();
  });

  // Replace leave button with join button
  // const joinButton = document.getElementById("joinBtn");
  // joinButton.textContent = "Join Room";
  // joinButton.onclick = joinRoom;
}

async function changeMicrophone() {
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => track.stop());
  }
  await getLocalStream();

  peers.forEach((peerConnection) => {
    const audioTrack = localStream.getAudioTracks()[0];
    const sender = peerConnection.getSenders().find((s) => s.track.kind === audioTrack.kind);
    if (sender) {
      sender.replaceTrack(audioTrack);
    }
  });
}
async function getLocalStream() {
  const cameraSelect = document.getElementById("cameraSelect");
  const microphoneSelect = document.getElementById("microphoneSelect");
  const resolutionSelect = document.getElementById("resolutionSelect");
  let videoConstraints;

  const constraints = {
    video: {
      deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined,
    },
    audio: {
      deviceId: microphoneSelect.value ? { exact: microphoneSelect.value } : undefined,
    },
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
}

async function changeCamera() {
  if (localStream) {
    localStream.getVideoTracks().forEach((track) => track.stop());
  }
  await getLocalStream();
  const videoElement = document.getElementById("video-local");
  if (videoElement) {
    videoElement.srcObject = localStream;
  }

  // Update peer connections with new video track
  peers.forEach((peerConnection) => {
    const videoTrack = localStream.getVideoTracks()[0];
    const sender = peerConnection.getSenders().find((s) => s.track.kind === videoTrack.kind);
    if (sender) {
      sender.replaceTrack(videoTrack);
    }
  });
}

function createPeerConnection(socketId, userId, isMuted, isVideoOn) {
  const peerConnection = new RTCPeerConnection(configuration);

  // Add local tracks to the connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate, roomId, socketId);
    }
  };

  // Handle incoming streams
  peerConnection.ontrack = (event) => {
    const videoElement = createVideoElement(socketId, `${myData.role == "veterinarian" ? consultation.bookerName : consultation.veterinarianNameAndTitle}`, isMuted, isVideoOn);
    videoElement.srcObject = event.streams[0];
  };
  peerConnection.onconnectionstatechange = () => {
    switch (peerConnection.connectionState) {
      case "disconnected":
        setOnlineStatus("Disconnecting…");

      case "closed":
        setOnlineStatus("Offline");

      case "failed":
        document.getElementById("video-" + socketId).parentElement.remove();
        break;
      default:
        break;
    }
  };

  peers.set(socketId, peerConnection);

  return peerConnection;
}

function createVideoElement(socketId, userName, isMuted, isVideoOn) {
  const existingVideo = document.getElementById(`video-${socketId}`);
  if (existingVideo) return existingVideo;

  const wrapper = document.createElement("div");
  wrapper.className = "";

  const controls = document.createElement("div");
  controls.className = "mt-4 flex items-center gap-2";

  const video = document.createElement("video");
  video.id = `video-${socketId}`;
  video.autoplay = true;
  video.playsInline = true;
  video.className = "w-[400px] rounded bg-blue-200";

  const label = document.createElement("p");
  label.className = "text-center text-base font-semibold";
  label.textContent = userName;

  const buttonMic = document.createElement("button");
  buttonMic.className = "flex aspect-square h-8 items-center justify-center rounded border-2 border-gray-300";

  const buttonVideo = document.createElement("button");
  buttonVideo.className = "flex aspect-square h-8 items-center justify-center rounded border-2 border-gray-300";

  const statusMic = document.createElement("div");
  statusMic.className = "text-sm text-gray-600";
  statusMic.innerHTML = isMuted ? `<i class="fa-solid fa-microphone-slash"></i>` : `<i class="fa-solid fa-microphone"></i>`;

  const statusVid = document.createElement("div");
  statusVid.className = "text-sm text-gray-600";
  statusVid.innerHTML = isVideoOn ? `<i class="fa-solid fa-video"></i>` : `<i class="fa-solid fa-video-slash"></i>`;

  if (socketId === "local") {
    buttonMic.onclick = toggleMute;
    buttonVideo.onclick = toggleVideo;
  }

  buttonMic.appendChild(statusMic);
  buttonVideo.appendChild(statusVid);
  controls.appendChild(buttonVideo);
  controls.appendChild(buttonMic);
  controls.appendChild(label);
  wrapper.appendChild(video);
  wrapper.appendChild(controls);
  document.getElementById("videoContainer").appendChild(wrapper);
  return video;
}

function toggleMute() {
  localIsMuted = !localIsMuted; 
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !localIsMuted;
  });

  const videoElement = document.getElementById("video-local");
  const controls = videoElement.nextElementSibling;
  const buttonMic = controls.children[1]; 
  const statusMic = buttonMic.querySelector("div"); 

  statusMic.innerHTML = localIsMuted
    ? `<i class="fa-solid fa-microphone-slash"></i>`
    : `<i class="fa-solid fa-microphone"></i>`;
  peers.forEach((pc, socketId) => {
    socket.emit("user-muted", socketId, localIsMuted);
  });
}

function toggleVideo() {
  localIsVideoOn = !localIsVideoOn; 
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = localIsVideoOn;
  });

  const videoElement = document.getElementById("video-local"); 
  const controls = videoElement.nextElementSibling; 
  const buttonVideo = controls.children[0]; 
  const statusVid = buttonVideo.querySelector("div"); 

  statusVid.innerHTML = localIsVideoOn
    ? `<i class="fa-solid fa-video"></i>`
    : `<i class="fa-solid fa-video-slash"></i>`;

  socket.emit("user-video-toggled", localIsVideoOn); 
}


async function getCameras() {
  await getLocalStream();

  // Display local video
  const videoElement = createVideoElement("local", `You (${myData.name})`, localIsMuted, localIsVideoOn);
  videoElement.muted = true;
  videoElement.srcObject = localStream;

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter((device) => device.kind === "videoinput");
  const cameraSelect = document.getElementById("cameraSelect");
  cameraSelect.innerHTML = "";
  videoDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || `Camera ${cameraSelect.length + 1}`;
    cameraSelect.appendChild(option);
  });
}

// Socket event handlers

// Get available cameras on page load

async function getMicrophones() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioDevices = devices.filter((device) => device.kind === "audioinput");
  const microphoneSelect = document.getElementById("microphoneSelect");
  microphoneSelect.innerHTML = "";
  audioDevices.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.deviceId;
    option.text = device.label || `Microphone ${microphoneSelect.length + 1}`;
    microphoneSelect.appendChild(option);
  });
}

// Get available microphones on page load

document.addEventListener("DOMContentLoaded", async () => {
  myData = await getMe();
  consultation = await getConsultation();
  roomId = consultation.id;
  getCameras();
  await getMicrophones();

  if (query.get("id")) {
    localStorage.setItem("id", query.get("id"));
  }
  if (query.get("token")) {
    localStorage.setItem("token", query.get("token"));
  }
  if (localStorage.getItem("isSubmitConsultation")) {
    document.getElementById("submitConsultationButton").classList.add("hover:bg-gray-700");
    document.getElementById("submitConsultationButton").classList.add("bg-gray-600");
  } else {
    document.getElementById("submitConsultationButton").classList.add("hover:bg-green-700");
    document.getElementById("submitConsultationButton").classList.add("bg-green-600");
   }

  // const joinButton = document.getElementById("joinBtn");
  // joinButton.onclick = joinRoom;
  document.getElementById("serviceName").innerText = consultation.serviceName;
  document.getElementById("consultationTimeRange").innerText = `${new Date(consultation.startTime).toLocaleString()} - ${new Date(consultation.endTime).toLocaleString()}`;

  const timer = document.getElementById("timer");
  const countDownDate = new Date(consultation.endTime).getTime();

  const interval = setInterval(() => {
    const now = new Date().getTime();
    const startTime = new Date(consultation.startTime).getTime();
    let distance;
    if (startTime > new Date().getTime()) {
      console.log("distance", startTime - now);
      distance = startTime - now;
      timer.classList.remove("bg-danger");
      timer.classList.add("bg-success");
      if (distance === 600000) {
        consultation = getConsultation();
      }
      if (distance <= 300) {
        document.getElementById("ShowInformation").innerText = "saat ini anda sudah bisa berkomunikasi Via chat, video akan ditampilkan saat waktu konsultasi dimulai";
        if (isJoined) {
          document.getElementById("chat").classList.remove("hidden");
          document.getElementById("textEditor").classList.remove("hidden");
        } else {
          if (!document.getElementById("chat").classList.contains("hidden")) {
            document.getElementById("chat").classList.add("hidden");
          }
          if (!document.getElementById("textEditor").classList.contains("hidden")) {
            document.getElementById("textEditor").classList.add("hidden");
          }
        }
      }
      if (!isJoined) {
        document.getElementById("waitingRoomBefore").classList.remove("hidden");
      } else {
        if (!document.getElementById("waitingRoomBefore").classList.contains("hidden")) {
          document.getElementById("waitingRoomBefore").classList.add("hidden");
        }
      }
      if (!isJoined && distance <= 300) {
        document.getElementById("buttonJoinRoom").classList.remove("hidden");
      } else {
        if (!document.getElementById("buttonJoinRoom").classList.contains("hidden")) {
          document.getElementById("buttonJoinRoom").classList.add("hidden");
        }
      }
      // if (!isJoined)

    } else {
      distance = countDownDate - now;
      document.getElementById("ShowInformation").innerText = "Konsultasi telah dimulai, pastikan mengirim hasil konsultasi sebelum waktu habis";
      if (!isJoined) {
        if (!document.getElementById("video").classList.contains("hidden")) {
          document.getElementById("video").classList.add("hidden");
        }
        if (!document.getElementById("chat").classList.contains("hidden")) {
          document.getElementById("chat").classList.add("hidden");
        }
        if (!document.getElementById("textEditor").classList.contains("hidden")) {
          document.getElementById("textEditor").classList.add("hidden");
        }
        document.getElementById("waitingRoomAfter").classList.remove("hidden");
      } else {
        if (!document.getElementById("waitingRoomAfter").classList.contains("hidden")) {
          document.getElementById("waitingRoomAfter").classList.add("hidden");
        }
        document.getElementById("chat").classList.remove("hidden");
        document.getElementById("video").classList.remove("hidden");
        document.getElementById("textEditor").classList.remove("hidden");
      }
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    timer.textContent = `${days.toString().padStart(2, "0")}:${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    if (distance < -10) {
      clearInterval(interval);
      // timer.textContent = "EXPIRED";
      leaveRoom();
    }
  }, 1000);
});
