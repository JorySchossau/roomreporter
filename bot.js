const puppeteer = require('puppeteer');

const { WebClient } = require('@slack/web-api');
const token = process.env.SLACK_TOKEN;
const web = new WebClient(token);

var express    = require('express'),
    app        = express();

const channelID = process.env.SLACK_CHANNEL;

app.use(express.static('assets'));

var names = [] // active users in hangout
var priorNames = [] // previous value, to see what changed

function getReactionToParticipantList() {
	const INCLUDE_MSG = "The hangout now includes:"
	const JOIN_MSG = " joined. " + INCLUDE_MSG
  const LEFT_MSG = " left. " + INCLUDE_MSG
  const EMPTY_MSG = "No one in the hangout (room bot is lonely)"
	let arrivedNames = names.filter(x => !priorNames.includes(x)).filter(x => x != "RoomBot");
  let departedNames = priorNames.filter(x => !names.includes(x)).filter(x => x != "RoomBot");
  var msg = ""
  // arrived
  if (arrivedNames.length > 2) {
  	msg = `${arrivedNames.slice(0,-1).join(", ")}, and ${arrivedNames[arrivedNames.length-1]}${JOIN_MSG}\n${names.join("\n")}`
  } else if (arrivedNames.length == 2) {
  	msg = `${arrivedNames.join(" and ")}${JOIN_MSG}\n${names.join("\n")}`
  } else if (arrivedNames.length == 1) {
  	msg = `${arrivedNames[0]}${JOIN_MSG}\n${names.join("\n")}`
  }
  if (names.length == 0 && msg.length != 0) {
  	msg += EMPTY_MSG
  }
  // departed
  if (departedNames.length > 2) {
  	msg = `${names.length}) ${departedNames.slice(0,-1).join(", ")}, and ${departedNames[departedNames.length-1]}${LEFT_MSG}\n${names.join("\n")}`
  } else if (departedNames.length == 2) {
  	msg = `${departedNames.join(" and ")}${LEFT_MSG}\n${names.join("\n")}`
  } else if (departedNames.length == 1) {
  	msg = `${departedNames[0]}${LEFT_MSG}\n${names.join("\n")}`
  }
  if (names.length == 0 && msg.length != 0) {
  	msg += EMPTY_MSG
  }
  return (msg)
}

async function joinRoom(room, botname) {
  const chromeArgs = [
      // Disable sandboxing, gives an error on Linux
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Automatically give permission to use media devices
      '--use-fake-ui-for-media-stream',
      //  You may need to play with these options to get proper input and output
      //'--alsa-output-device=plug:hw:0,1'
      '--alsa-input-device=plug:hw:1',
  ];
  const meetArgs = [
      // Disable receiving of video
      'config.channelLastN=0',
      // Unmute our audio
      'config.startWithAudioMuted=false',
      // Don't use simulcast to save resources on the sender (our) side
      'config.disableSimulcast=true',
      // Disable P2P mode due to a bug in Jitsi Meet
      'config.p2p.enabled=false',
      // Disable prejoin page
      'config.prejoinPageEnabled=false'
  ];
  const baseUrl='https://meet.jit.si'
  const url = `${baseUrl}/${room}#${meetArgs.join('&')}`;
  console.log(`Loading ${url}`);
  
  const browser = await puppeteer.launch({
      args: chromeArgs,
      handleSIGINT: false,
      executablePath: '/home/jory/srcprogs/chrome/opt/google/chrome/google-chrome',
      ignoreDefaultArgs: ['--mute-audio'],
  });
 
  const page = await browser.newPage();

  // Manual handling on SIGINT to gracefully hangup and exit
  process.on('SIGINT', async () => {
      console.log('Exiting...');
      await page.evaluate('APP.conference.hangup();');
      await page.close();
      browser.close();
      console.log('Done!');
      process.exit();
  });
  await page.goto(url);
  await page.evaluate(`APP.conference.changeLocalDisplayName("${botname}");`);

  await page.waitForSelector('.hangup-button')

  while (true) {
    await page.waitForTimeout(5000);
    console.log('checking participant list')
    names = await page.evaluate('APP.conference._room.getParticipants().map(p => p.getDisplayName());');
    var msg = getReactionToParticipantList()
    if (msg.length != 0) {
      // ID of the channel you want to send the message to
      try {
        // Call the chat.postMessage method using the WebClient
        const result = await web.chat.postMessage({
          channel: channelID,
          text: msg
        });
        // UPDATES a message instead of posting a new message
        //const result = await web.chat.update({
        //  channel: "C04AM631JCS", // get from web.chat.postMessage response
        //  ts: "1668384194.097769", // get from web.chat.postMessage response
        //  text: msg
        //});
      }
      catch (error) {
        console.error(error);
      }
    }
    priorNames = [...names]
  }
}

const PORT = 3000;

// not sure if this route is necessary
app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(PORT, () => console.log(`Server listening on port: ${PORT}`));

// try to join room until success (it fails sometimes)
var ranOkay = false
while (ranOkay == false) {
  try {
    console.log("trying to join room")
    joinRoom(name='labhangoutlabtest',botname='RoomBot');
    ranOkay = true
  } catch (TypeError) {
    ranOkay = false
  }
}

