export const FATTYS_LIVE_TV = [
  // Add web-playable FUITS LIVE TV WORLD videos here.
  // The app cannot play T:\ drive paths after it is deployed to Vercel.
  // Use direct https video URLs, Jellyfin/tunnel stream URLs, or files in public/fattys-live-tv.
  //
  // Example:
  // {
  //   id: "simpsons-movie",
  //   title: "The Simpsons Movie",
  //   src: "https://your-video-url.example/the-simpsons-movie.mp4"
  // }
];

export const FUITS_LIVE_TV_PLAYLIST = {
  title: "FUITS LIVE TV WORLD",
  publicChannelUrl: "https://cents-carries-exercise-earlier.trycloudflare.com",
  localPlaylistPath: "T:\\FattysLiveTV\\Playlists\\FuitsLiveTV\\fuits-live-tv-world.m3u",
  items: FATTYS_LIVE_TV
};

export const APP_COPY_LABEL = "MAIN DEPLOY COPY";
export const APP_COPY_NOTE = "Use this copy for GitHub, Vercel, and real app fixes.";
