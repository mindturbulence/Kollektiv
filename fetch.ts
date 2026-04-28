import https from 'https';
https.get('https://www.onlinewebfonts.com/tag/Microgramma', (res) => {
  let data = '';
  res.on('data', Buffer => data += Buffer.toString());
  res.on('end', () => console.log(data.match(/db\.onlinewebfonts\.com[^'"]+/g)?.slice(0, 5)));
});
