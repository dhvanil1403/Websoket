const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const { Pool } = require('pg');

// Database connection setup
const pool = new Pool({
  user: 'u3m7grklvtlo6',
  host: '35.209.89.182',
  database: 'dbzvtfeophlfnr',
  password: 'AekAds@24',
  port: 5432,
});

const app = express();
const port = process.env.PORT || 10000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const clients = {};
const statusClients = {};

// WebSocket server
const wsServer = new WebSocket.Server({ noServer: true });

wsServer.on('connection', async (ws, req) => {
  const clientId = req.url.split('/').pop();
  if (!clientId || !/^\d+$/.test(clientId)) {
    console.log(`Invalid clientId: ${clientId}`);
    ws.close(); 
    return;
  }                                   

  if (clientId === 'status') {
    statusClients[ws] = true;
    console.log(`Status client connected`);
  } else {
    clients[clientId] = ws;
    const dateTime = new Date().toISOString(); // Updated format
    
    // Insert or update the client status in the database
    await pool.query(
      'INSERT INTO client_statuses (client_name, status, updated_at) VALUES ($1, $2, $3) ON CONFLICT (client_name) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at',
      [clientId, 'online', dateTime]
    );

    console.log(`Client ${clientId} connected`);
    broadcastStatus(clientId, 'online', dateTime);
  }













ws.on('message', async (message) => {
  console.log(`Received message from ${clientId}: ${message}`);

  let data;
  try {
    data = JSON.parse(message);
  } catch (error) {
    console.error(`Failed to parse message: ${message}`, error);
    return; // Exit early if message parsing fails
  }

  console.log(`Parsed data from message:`, data);

  const dateTime = new Date().toISOString(); // Updated format

  if (data.type === 'network') {
    console.log(`Network status data received:`, data);

    // Store network status in the database
    try {
      await pool.query(
        'INSERT INTO network_statuses (client_name, status, updated_at) VALUES ($1, $2, $3) ON CONFLICT (client_name) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at',
        [data.clientId, data.status, dateTime]
      );

      console.log(`Network status updated in database for client ${data.clientId}: ${data.status} at ${dateTime}`);
    } catch (error) {
      console.error(`Failed to update network status in database:`, error);
    }
  } else if (data.type === 'Device_Config') {
    console.log(`Device configuration data received:`, data);

    // Store device configuration data in the database
    try {
      await pool.query(
        'INSERT INTO device_configs (client_name, ram_total, ram_used, storage_total, storage_used, resolution, downstream_bandwidth, upstream_bandwidth, manufacturer, model, os_version, wifi_enabled, wifi_mac_address, wifi_network_ssid, wifi_signal_strength_dbm, android_id, IfSecondScreenIsPresentOnDevice, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) ON CONFLICT (client_name) DO UPDATE SET ram_total = EXCLUDED.ram_total, ram_used = EXCLUDED.ram_used, storage_total = EXCLUDED.storage_total, storage_used = EXCLUDED.storage_used, resolution = EXCLUDED.resolution, downstream_bandwidth = EXCLUDED.downstream_bandwidth, upstream_bandwidth = EXCLUDED.upstream_bandwidth, manufacturer = EXCLUDED.manufacturer, model = EXCLUDED.model, os_version = EXCLUDED.os_version, wifi_enabled = EXCLUDED.wifi_enabled, wifi_mac_address = EXCLUDED.wifi_mac_address, wifi_network_ssid = EXCLUDED.wifi_network_ssid, wifi_signal_strength_dbm = EXCLUDED.wifi_signal_strength_dbm, android_id = EXCLUDED.android_id, IfSecondScreenIsPresentOnDevice = EXCLUDED.IfSecondScreenIsPresentOnDevice, updated_at = EXCLUDED.updated_at',
        [
          clientId,
          data.ram_total,
          data.ram_used,
          data.storage_total,
          data.storage_used,
          data['Screen-resolution'],
          data.downstream_bandwidth,
          data.upstream_bandwidth,

          data.manufacturer,
          data.model,
          data.os_version,
          data.wifiEnabled,
          data.wifiMacAddress,
          data.wifiNetworkSSID,
          data.wifiSignalStrengthdBm,
          data.androidId,
          data.IfSecondScreenIsPresentOnDevice, // Updated field as integer
          dateTime,
        ]
      );

      console.log(`Device configuration updated in database for client ${clientId} at ${dateTime}`);
    } catch (error) {
      console.error(`Failed to update device configuration in database:`, error);
    }
  } else {
    console.log(`Received non-network and non-Device_Config data:`, data);
  }
});

























  
  ws.on('close', async () => {
    if (clientId !== 'status') {
      delete clients[clientId];
      const dateTime = new Date().toISOString(); // Updated format
      
      // Update the client status in the database
      await pool.query(
        'UPDATE client_statuses SET status = $1, updated_at = $2 WHERE client_name = $3',
        ['offline', dateTime, clientId]
      );

      console.log(`Client ${clientId} disconnected`);
      broadcastStatus(clientId, 'offline', dateTime);
    } else {
      console.log(`Status client disconnected`);
    }
  });
});

// Broadcast client status to status clients
function broadcastStatus(clientId, status, dateTime) {
  const statusMessage = JSON.stringify({ clientId, status, dateTime });
  Object.keys(statusClients).forEach((client) => client.send(statusMessage));
  console.log(`Broadcasting status: ${statusMessage}`);
}

// Periodically check client statuses every 20 seconds
setInterval(() => {
  Object.keys(clients).forEach(async (clientId) => {
    const ws = clients[clientId];
    const dateTime = new Date().toISOString(); // Updated format

    if (ws.readyState === WebSocket.OPEN) {
      console.log(`Checking status for client ${clientId}`);

      // Send a ping message to check the connection
      ws.send(JSON.stringify({ type: 'ping', message: 'p' }));
      console.log(`Ping sent to client ${clientId}`);

      // Update the status in the database
      try {
        await pool.query(
          'UPDATE client_statuses SET status = $1, updated_at = $2 WHERE client_name = $3',
          ['online', dateTime, clientId]
        );
        console.log(`Client ${clientId} status updated to online at ${dateTime}`);
      } catch (error) {
        console.error(`Error updating client ${clientId} status:`, error);
      }
    } else {
      // Client is disconnected
      delete clients[clientId];
      console.log(`Client ${clientId} is disconnected`);

      try {
        await pool.query(
          'UPDATE client_statuses SET status = $1, updated_at = $2 WHERE client_name = $3',
          ['offline', dateTime, clientId]
        );
        console.log(`Client ${clientId} marked as offline at ${dateTime}`);
        broadcastStatus(clientId, 'offline', dateTime);
      } catch (error) {
        console.error(`Error updating client ${clientId} status:`, error);
      }
    }
  });
}, 20000);

// HTTP server and WebSocket upgrade
const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

server.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit('connection', ws, request);
  });
});

// Routes
app.get('/client/:id', async (req, res) => {
  const clientId = req.params.id;
  if (!clientId || !/^\d+$/.test(clientId)) {
    console.log(`Client ID not found: ${clientId}`);
    return res.status(404).send('Client not found');
  }

  console.log(`Rendering client page for Client ${clientId}`);
  res.render('client', { clientId });
});

app.get('/status', async (req, res) => {
  // Retrieve client statuses from the database
  const clientStatusResult = await pool.query('SELECT client_name, status, updated_at FROM client_statuses');
  const screensResult = await pool.query('SELECT * FROM screens');
// Extract screen data from the result
const screens = screensResult.rows;
// console.log("screens",screens);

  const clientStatuses = {};
  clientStatusResult.rows.forEach(row => {
    clientStatuses[row.client_name] = { status: row.status, dateTime: row.updated_at };
  });

  // Retrieve network statuses from the database
  const networkStatusResult = await pool.query('SELECT client_name, status, updated_at FROM network_statuses');
  const networkStatuses = {};
  networkStatusResult.rows.forEach(row => {
    networkStatuses[row.client_name] = { status: row.status, dateTime: row.updated_at };
  });


  console.log('Rendering status page with client and network data');
  res.render('status', { clientStatuses, networkStatuses, screens});
});

app.post('/restart-client/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'restart' , message: 'restart app'  }));
    res.json({ message: `Restart command sent to client ${clientId}` });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});
app.post('/update-app/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

 if (ws && ws.readyState === WebSocket.OPEN) {
    const updateMessage = 'https://drive.google.com/file/d/1XlAnFhItcWFHUvHzajsVZ1rxJc8dzg8m/view?usp=drive_link';
    
    // Send the WebSocket message
    ws.send(JSON.stringify({ type: 'update-app', message: updateMessage }));
    
    // Respond with the WebSocket message included in the JSON response
    res.json({ 
      message: `Update command sent to client ${clientId}`,
      updateMessage: updateMessage 
    });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});
app.post('/volume-up/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'VOLUME_UP', message: 'Increase volume' }));
    res.json({ message: `Volume up command sent to client ${clientId}` });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});

app.post('/volume-down/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'VOLUME_DOWN', message: 'Decrease volume' }));
    res.json({ message: `Volume down command sent to client ${clientId}` });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});
app.post('/mute-client/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'mute', message: 'Mute client' }));
    res.json({ message: `Mute command sent to client ${clientId}` });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});

app.post('/unmute-client/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'unmute', message: 'Unmute client' }));
    res.json({ message: `Unmute command sent to client ${clientId}` });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});
app.post('/screen-sort/:id', (req, res) => {
  const clientId = req.params.id;
  const ws = clients[clientId];

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'SCREEN_SORT', message: 'Sort screens' }));
    res.json({ message: `Screen sort command sent to client ${clientId}` });
  } else {
    res.status(404).json({ message: `Client ${clientId} is not connected` });
  }
});




app.post('/delete-client/:id', async (req, res) => {
  const clientId = req.params.id;

  try {
    // Delete the client from client_statuses table
    const deleteQuery = 'DELETE FROM client_statuses WHERE client_name = $1';
    await pool.query(deleteQuery, [clientId]);

    // Optionally send a success response
    res.status(200).send({ message: 'Client deleted successfully.' });
  } catch (err) {
    console.error('Error deleting client:', err);
    res.status(500).send({ error: 'Failed to delete client.' });
  }
});
