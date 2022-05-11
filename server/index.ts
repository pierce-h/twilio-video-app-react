import express from 'express';
import path from 'path';
import twilio from 'twilio';
import { v4 } from 'uuid';
import dotEnv from 'dotenv-flow';
import cors from 'cors';

dotEnv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8081;

const app = express();

app.use(express.json());
app.use(cors());

// create the twilioClient
const twilioClient = twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
});

// NOTE - we probably dont need this!
// app.all('/recordingrules', authMiddleware, recordingRulesEndpoint);

const findOrCreateRoom = async (roomName: string) => {
  try {
    // see if the room exists already. If it doesn't, this will throw
    // error 20404.
    await twilioClient.video.rooms(roomName).fetch();
  } catch (error) {
    // the room was not found, so create it
    if (error.code === 20404) {
      await twilioClient.video.rooms.create({
        uniqueName: roomName,
        type: 'group',
      });
    } else {
      // let other errors bubble up
      throw error;
    }
  }
};

const getAccessToken = (roomName: string) => {
  // create an access token
  const token = new twilio.jwt.AccessToken(
    process.env.TWILIO_ACCOUNT_SID as string,
    process.env.TWILIO_API_KEY_SID as string,
    process.env.TWILIO_API_KEY_SECRET as string,
    // generate a random unique identity for this participant
    { identity: v4() }
  );
  // create a video grant for this specific room
  const videoGrant = new twilio.jwt.AccessToken.VideoGrant({
    room: roomName,
  });

  // add the video grant
  token.addGrant(videoGrant);
  // serialize the token and return it
  return token.toJwt();
};

app.post('/token', async (req, res) => {
  // return 400 if the request has an empty body or no room_name
  if (!req.body || !req.body.room_name) {
    return res.status(400).send('Must include room_name argument.');
  }
  const room_name = (req.body.room_name as unknown) as string;
  // find or create a room with the given room_name
  findOrCreateRoom(room_name);
  // generate an Access Token for a participant in this room
  const token = getAccessToken(room_name);
  res.send({
    token: token,
  });
});

app.get('/ping', async (req, res) => {
  res.send({ message: 'pong' });
});

app.use((req, res, next) => {
  // Here we add Cache-Control headers in accordance with the create-react-app best practices.
  // See: https://create-react-app.dev/docs/production-build/#static-file-caching
  if (req.path === '/' || req.path === 'index.html') {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, '../build/index.html'), { etag: false, lastModified: false });
  } else {
    res.set('Cache-Control', 'max-age=31536000');
    next();
  }
});

app.use(express.static(path.join(__dirname, '../build')));

app.get('*', (_, res) => {
  // Don't cache index.html
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '../build/index.html'), { etag: false, lastModified: false });
});

app.listen(PORT, () => console.log(`video-app server running on ${PORT}`));
