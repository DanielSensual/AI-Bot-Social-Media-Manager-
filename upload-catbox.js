import fs from 'fs';
async function run() {
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    formData.append("fileToUpload", new Blob([fs.readFileSync("video-1080.mp4")]), "video-1080.mp4");
    
    try {
        const response = await fetch("https://catbox.moe/user/api.php", {
            method: "POST",
            body: formData,
        });
        const text = await response.text();
        console.log("Catbox Output:", text);
    } catch(err) {
        console.error(err);
    }
}
run();
