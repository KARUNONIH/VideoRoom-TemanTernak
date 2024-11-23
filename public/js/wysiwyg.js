const parameter = new URLSearchParams(window.location.search);

const quill = new Quill("#hasil-konsultasi", {
  theme: "snow",
  placeholder: "Type your message here...",
  modules: {
    toolbar: [["bold", "italic", "underline", "strike"], [{ list: "ordered" }, { list: "bullet" }], [{ script: "sub" }, { script: "super" }], [{ color: [] }, { background: [] }], ["clean"]],
  },
});

const savedData = localStorage.getItem("hasilKonsultasi");
if (savedData) {
  quill.root.innerHTML = savedData;
}

quill.on("text-change", function () {
  const content = quill.root.innerHTML;
  localStorage.setItem("hasilKonsultasi", content);
});

async function submitConsultation() {
  const data = localStorage.getItem("hasilKonsultasi");

  if (!data) {
    Swal.fire({
      icon: "warning",
      title: "Tidak ada data",
      text: "Tidak ada data konsultasi untuk dikirim.",
      confirmButtonText: "OK",
    });
    return;
  }

  try {
    const response = await fetch(`https://api.temanternak.h14.my.id/bookings/${parameter.get("id") || localStorage.getItem("id")}/consultations/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${parameter.get("token") || localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ result: data }),
    });

    if (!response.ok) {
      throw new Error("Gagal mengirim data. Silakan coba lagi.");
    }

    Swal.fire({
      icon: "success",
      title: "Berhasil!",
      text: "Hasil konsultasi berhasil dikirim!",
      confirmButtonText: "OK",
    }).then(() => {
      localStorage.removeItem("hasilKonsultasi");
      quill.root.innerHTML = "";
    });
  } catch (error) {
    console.error("Error:", error);
    Swal.fire({
      icon: "error",
      title: "Kesalahan",
      text: "Terjadi kesalahan saat mengirim data. Silakan coba lagi nanti.",
      confirmButtonText: "OK",
    });
  }
}
