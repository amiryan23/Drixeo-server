const { Server } = require("socket.io");
const cors = require('cors');
const {authenticateSocketJWT} = require("./utils/utils")
const {encryptData} = require("./utils/encryptData")
const formatDateForMySQL = require("./utils/formatDateForMySQL")


module.exports = (server, db) => {
  const io = new Server(server, {
  cors: {
    origin: "https://drixeo.netlify.app",
    methods: ['GET', 'POST'],
  },
});



io.use(authenticateSocketJWT);

io.on('connection', (socket) => {
  console.log('New user connected');

socket.on('joinRoom', ({ roomId, userId }) => {
  if (!userId || !roomId) {
    console.error('Invalid joinRoom event. userId or roomId is missing.');
    return;
  }

  if (userId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }

  console.log(`Пользователь ${userId} присоединился к комнате ${roomId}`);

  const query = 'SELECT * FROM rooms WHERE roomId = ?';
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Ошибка при получении данных комнаты:', err);
      return;
    }

    const room = results[0];
    let members = room?.members ? JSON.parse(room.members) : [];
    let historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];
    let videoSettings = room?.videoSettings ? JSON.parse(room?.videoSettings) : []
    let chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];

    if (!members.includes(userId)) {
      members.push(userId);
    }

    if (!historyMembers.includes(userId)) {
      historyMembers.push(userId);
    }

    const joinMessage = {
      id: chatRoom.length + 1,
      userId: 'admin', 
      joinedId: userId,
      text: `Connected to the room`
    };
    chatRoom.push(joinMessage); 

    const updateQuery = `
      UPDATE rooms SET 
      members = ?, 
      historyMembers = ?,
      chatRoom = ? 
      WHERE roomId = ?
    `;
    db.query(updateQuery, [
      JSON.stringify(members),
      JSON.stringify(historyMembers),
      JSON.stringify(chatRoom),
      roomId
    ], (updateErr) => {
      if (updateErr) {
        console.error('Ошибка при обновлении данных комнаты:', updateErr);
        return;
      }

      const userQuery = 'SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)';
      db.query(userQuery, [historyMembers], (userErr, userResults) => {
        if (userErr) {
          console.error('Ошибка при получении данных пользователей:', userErr);
          return;
        }

const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);
  
  const gifts = JSON.parse(user.gifts) || [];
  
  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,     
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts, 
  };
});

        socket.join(roomId);

        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

        io.to(roomId).emit('roomUpdated', {
          encryptedData
        });

        socket.emit('roomUpdated', {
          encryptedData
        });
      });
    });
  });
});


socket.on('sendMessage', ({ roomId, userId, text , reply }) => {
  if (!roomId || !userId || !text) {
    console.error('Invalid sendMessage event. Missing data.');
    return;
  }

  if (userId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }

  // console.log(`User ${userId} sent a message in room ${roomId}: ${text}`);

  const query = 'SELECT * FROM rooms WHERE roomId = ?';
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Error fetching room data:', err);
      return;
    }

    const room = results[0];
    let chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
    let members = room?.members ? JSON.parse(room.members) : [];
    let historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];
    let videoSettings = room?.videoSettings ? JSON.parse(room?.videoSettings) : []

    const newMessage = {
      id: chatRoom.length + 1,
      userId,
      text,
      reply:reply || null,
      timestamp: new Date().toISOString() 
    };
    chatRoom.push(newMessage);

    const updateQuery = `
      UPDATE rooms SET 
      chatRoom = ? 
      WHERE roomId = ?
    `;
    db.query(updateQuery, [
      JSON.stringify(chatRoom),
      roomId
    ], (updateErr) => {
      if (updateErr) {
        console.error('Error updating room data:', updateErr);
        return;
      }

      const userQuery = 'SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)';
      db.query(userQuery, [historyMembers], (userErr, userResults) => {
        if (userErr) {
          console.error('Error fetching users data:', userErr);
          return;
        }

const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);
  
  const gifts = JSON.parse(user.gifts) || [];
  
  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,      
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts, 
  };
});

        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

        io.to(roomId).emit('roomUpdated', {
          encryptedData
        });

        socket.emit('roomUpdated', {
          encryptedData
        });
      });
    });
  });
});


socket.on('deleteMessage', ({ roomId, messageId }) => {
  if (!roomId || !messageId) {
    console.error('Invalid deleteMessage event. Missing data.');
    return;
  }

  console.log(`Marking message with ID ${messageId} as deleted in room ${roomId}`);

  const query = 'SELECT * FROM rooms WHERE roomId = ?';
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Error fetching room data:', err);
      return;
    }

    const room = results[0];
    if (!room) {
      console.error('Room not found.');
      return;
    }

    let chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
    let members = room?.members ? JSON.parse(room.members) : [];
    let historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];
    let videoSettings = room?.videoSettings ? JSON.parse(room?.videoSettings) : [];

    chatRoom = chatRoom.map((message) => {
      if (message.id === messageId) {
        return { ...message, deleted: true };
      }
      return message;
    });

    const updateQuery = `
      UPDATE rooms SET 
      chatRoom = ? 
      WHERE roomId = ?
    `;

    db.query(updateQuery, [JSON.stringify(chatRoom), roomId], (updateErr) => {
      if (updateErr) {
        console.error('Error updating room data:', updateErr);
        return;
      }

      const userQuery = 'SELECT id, userId, first_name, last_name, photo_url, created_at, is_premium, custom_settings, gifts, exp FROM users WHERE userId IN (?)';
      db.query(userQuery, [historyMembers], (userErr, userResults) => {
        if (userErr) {
          console.error('Error fetching users data:', userErr);
          return;
        }

        const updatedUsers = userResults.map((user) => {
          const isOnline = members.includes(user.userId);

          const gifts = JSON.parse(user.gifts) || [];
          const updatedGifts = gifts.map((gift) => {
            const sender = userResults.find((u) => u.userId === gift.senderId);
            return {
              ...gift,
              senderName: sender ? sender.first_name : 'Unknown',
              senderPhoto: sender ? sender.photo_url : null,
            };
          });

          return {
            ...user,
            status: isOnline ? 'online' : 'offline',
            custom_settings: JSON.parse(user.custom_settings) || {},
            gifts: updatedGifts,
          };
        });

        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

        io.to(roomId).emit('roomUpdated', {
          encryptedData
        });

        socket.emit('messageMarkedAsDeleted', {
          messageId,
          success: true
        });

        console.log(`Message with ID ${messageId} marked as deleted and room updated successfully.`);
      });
    });
  });
});

socket.on('youtubeControl', ({ roomId, action, currentTime }) => {
  if (!roomId || !action) {
    console.error('Invalid youtubeControl event. Missing data.');
    return;
  }

  // console.log(`YouTube control action: ${action}, time: ${currentTime}`);

  const query = 'SELECT * FROM rooms WHERE roomId = ?';
  db.query(query, [roomId], (err, results) => {
    if (err) {
      console.error('Error fetching room data:', err);
      return;
    }

    const room = results[0];
    let chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
    if (!room) {
      console.error('Room not found:', roomId);
      return;
    }

    const videoSettings = JSON.stringify({ action, currentTime });
    const updateQuery = 'UPDATE rooms SET videoSettings = ? WHERE roomId = ?';

    db.query(updateQuery, [videoSettings, roomId], (updateErr) => {
      if (updateErr) {
        console.error('Error updating video settings:', updateErr);
        return;
      }

      const members = room.members ? JSON.parse(room.members) : [];
      const historyMembers = room.historyMembers ? JSON.parse(room.historyMembers) : [];
      const userQuery = 'SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)';

      db.query(userQuery, [historyMembers], (userErr, userResults) => {
        if (userErr) {
          console.error('Error fetching users data:', userErr);
          return;
        }

const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);
  
  const gifts = JSON.parse(user.gifts) || [];
  
  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,      
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts,
  };
}); 
        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings: { action, currentTime } 
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);


        io.to(roomId).emit('roomUpdated', {encryptedData});

        socket.emit('roomUpdated', {encryptedData});
      });
    });
  });
});


socket.on("videoIdUpdated", ({ roomId, newVideoId }) => {
  console.log(`Room ${roomId} video ID updated to ${newVideoId}`);
  
  const updateQuery = "UPDATE rooms SET videoLink = ? WHERE roomId = ?";
  db.query(updateQuery, [newVideoId, roomId], (err) => {
    if (err) {
      console.error("Error updating videoLink in database:", err);
      return;
    }

    console.log(`Database updated with new video ID: ${newVideoId} for room ${roomId}`);

    const fetchRoomQuery = "SELECT * FROM rooms WHERE roomId = ?";
    db.query(fetchRoomQuery, [roomId], (fetchErr, results) => {
      if (fetchErr) {
        console.error("Error fetching updated room data:", fetchErr);
        return;
      }

      const room = results[0];
      const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
      const members = room?.members ? JSON.parse(room.members) : [];
      const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

      const userQuery = "SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)";
      db.query(userQuery, [historyMembers], (userErr, userResults) => {
        if (userErr) {
          console.error("Error fetching users data:", userErr);
          return;
        }

const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);
  
  const gifts = JSON.parse(user.gifts) || [];
  
  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,      
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts, 
  };
});
      
       const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoLink: newVideoId
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

        io.to(roomId).emit("roomUpdated", {encryptedData});

        console.log(`Room ${roomId} updated and broadcasted via socket.io with users.`);
      });
    });
  });
});


socket.on("userBlockedUpdated", ({ roomId, userId }) => {
  console.log(`Toggling block status for user ${userId} in room ${roomId}`);

  const fetchRoomQuery = "SELECT * FROM rooms WHERE roomId = ?";
  db.query(fetchRoomQuery, [roomId], (roomErr, roomResults) => {
    if (roomErr) {
      console.error("Error fetching room data:", roomErr);
      return;
    }

    const room = roomResults[0];
    const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
    const blocked = room?.blocked ? JSON.parse(room.blocked) : [];
    let members = room?.members ? JSON.parse(room.members) : [];
    let videoSettings = room?.videoSettings ? JSON.parse(room?.videoSettings) : []

    const userIndex = blocked.indexOf(userId);
    if (userIndex !== -1) {
      blocked.splice(userIndex, 1);
      console.log(`User ${userId} unblocked in room ${roomId}`);

      const unblockMessage = {
        id: chatRoom.length + 1,
        userId: 'admin',
        unblockedId: userId,
        text: `Has been unblocked`,
      };
      chatRoom.push(unblockMessage);
    } else {
      blocked.push(userId);
      members = members.filter((member) => member !== userId);
    
      console.log(`User ${userId} blocked in room ${roomId}`);

      const blockMessage = {
        id: chatRoom.length + 1,
        userId: 'admin',
        blockedId: userId,
        text: `Has been blocked`,
      };
      chatRoom.push(blockMessage);
    }

    const updateRoomQuery = "UPDATE rooms SET blocked = ?, chatRoom = ? , members = ? WHERE roomId = ?";
    db.query(updateRoomQuery, [JSON.stringify(blocked), JSON.stringify(chatRoom),JSON.stringify(members), roomId], (updateErr) => {
      if (updateErr) {
        console.error("Error updating room data:", updateErr);
        return;
      }

      console.log(`Room data updated for room ${roomId}`);

      const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

      const userQuery = "SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)";
      db.query(userQuery, [historyMembers], (userErr, userResults) => {
        if (userErr) {
          console.error("Error fetching users data:", userErr);
          return;
        }



const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);
  
  const gifts = JSON.parse(user.gifts) || [];
  
  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,      
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts, 
  };
});


      const roomData = {
          ...room,
          members,  
          blocked,
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

        io.to(roomId).emit("roomUpdated", {encryptedData} );

        console.log(`Room ${roomId} updated and broadcasted via socket.io with block data.`);
      });
    });
  });
});


socket.on("assignOwner", ({ roomId, userId }) => {
  console.log(`Assigning user ${userId} as owner in room ${roomId}`);

  const updateOwnerQuery = "UPDATE rooms SET owner = ? WHERE roomId = ?";
  db.query(updateOwnerQuery, [userId, roomId], (err, results) => {
    if (err) {
      console.error("Error updating owner in database:", err);
      return;
    }

    console.log(`User ${userId} has been assigned as owner in room ${roomId}`);

    const fetchRoomQuery = "SELECT * FROM rooms WHERE roomId = ?";
    db.query(fetchRoomQuery, [roomId], (roomErr, roomResults) => {
      if (roomErr) {
        console.error("Error fetching room data:", roomErr);
        return;
      }

      const room = roomResults[0];

      const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
      const videoSettings = room?.videoSettings ? JSON.parse(room?.videoSettings) : []
      const assignOwnerMessage = {
        id: chatRoom.length + 1,
        userId: 'admin',
        assignedOwnerId: userId,
        text: `Has been assigned as the new owner`,
      };
      chatRoom.push(assignOwnerMessage);

      const updateRoomQuery = "UPDATE rooms SET chatRoom = ? WHERE roomId = ?";
      db.query(updateRoomQuery, [JSON.stringify(chatRoom), roomId], (updateErr) => {
        if (updateErr) {
          console.error("Error updating room data:", updateErr);
          return;
        }

        console.log(`Room data updated for room ${roomId}`);

        const members = room?.members ? JSON.parse(room.members) : [];
        const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

        const userQuery = "SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)";
        db.query(userQuery, [historyMembers], (userErr, userResults) => {
          if (userErr) {
            console.error("Error fetching users data:", userErr);
            return;
          }

const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);

  const gifts = JSON.parse(user.gifts) || [];
  

  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,      
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts, 
  };
});


         const roomData = {
          ...room,
          members, 
          owner: userId, 
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

          io.to(roomId).emit("roomUpdated", {encryptedData});

          console.log(`Room ${roomId} updated and broadcasted to all users with new owner.`);
        });
      });
    });
  });
});


socket.on("giftPremium", ({ senderId, receiverId, months, roomId , price }) => {
  console.log(`User ${senderId} is gifting premium to user ${receiverId} for ${months} months.`);

  if (senderId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }
  const fetchUserQuery = "SELECT * FROM users WHERE userId = ?";
  db.query(fetchUserQuery, [receiverId], (err, userResults) => {
    if (err) {
      console.error("Error fetching user data:", err);
      return;
    }

    if (userResults.length === 0) {
      console.error(`User ${receiverId} not found.`);
      return;
    }

    const user = userResults[0];

    const currentPremiumDate = user.premium_expires_at 
  ? new Date(user.premium_expires_at) 
  : new Date();

const newPremiumDate = new Date(Date.UTC(
  currentPremiumDate.getUTCFullYear(),
  currentPremiumDate.getUTCMonth() + months,
  currentPremiumDate.getUTCDate(),
  currentPremiumDate.getUTCHours(),
  currentPremiumDate.getUTCMinutes(),
  currentPremiumDate.getUTCSeconds()
));

    const formattedDate = formatDateForMySQL(newPremiumDate);

    const updateUserQuery = `
      UPDATE users 
      SET is_premium = ?, premium_expires_at = ?
      WHERE userId = ?
    `;
    db.query(updateUserQuery, [true, formattedDate, receiverId], (updateErr) => {
      if (updateErr) {
        console.error("Error updating user premium status:", updateErr);
        return;
      }

      console.log(`Premium gifted successfully to user ${receiverId} by user ${senderId}.`);

      const insertPaymentQuery = `
        INSERT INTO payments (giftName, senderId, receiverId, forStars , currentTime)
        VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
      `;
      db.query(insertPaymentQuery, [`Premium${months}`, senderId, receiverId, price ], (paymentErr) => {
        if (paymentErr) {
          console.error("Error inserting payment record:", paymentErr);
          return;
        }

        console.log(`Payment record created for premium gift from ${senderId} to ${receiverId}.`);

        const fetchRoomQuery = "SELECT * FROM rooms WHERE roomId = ?";
        db.query(fetchRoomQuery, [roomId], (roomErr, roomResults) => {
          if (roomErr) {
            console.error("Error fetching room data:", roomErr);
            return;
          }

          const room = roomResults[0];
          const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
          const members = room?.members ? JSON.parse(room.members) : [];
          const videoSettings = room?.videoSettings ? JSON.parse(room.videoSettings) : [];
          const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

          const giftMessage = {
            id: chatRoom.length + 1,
            userId: 'admin',
            senderId: senderId,
            giftImg: 'premium',
            giftedTo: receiverId,
            text: `Gift Premium for ${months} month(s)`,
            nextText: "Receiver",
          };
          chatRoom.push(giftMessage);

          const updateRoomQuery = "UPDATE rooms SET chatRoom = ? WHERE roomId = ?";
          db.query(updateRoomQuery, [JSON.stringify(chatRoom), roomId], (chatUpdateErr) => {
            if (chatUpdateErr) {
              console.error("Error updating chatRoom data:", chatUpdateErr);
              return;
            }

            const userQuery = "SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)";
            db.query(userQuery, [historyMembers], (userErr, userResults) => {
              if (userErr) {
                console.error("Error fetching users data:", userErr);
                return;
              }

              const updatedUsers = userResults.map((user) => {
                const isOnline = members.includes(user.userId);

                const gifts = JSON.parse(user.gifts) || [];
                const updatedGifts = gifts.map((gift) => {
                  const sender = userResults.find((u) => u.userId === gift.senderId);
                  return {
                    ...gift,
                    senderName: sender ? sender.first_name : 'Unknown',
                    senderPhoto: sender ? sender.photo_url : null,
                  };
                });

                return {
                  ...user,
                  status: isOnline ? 'online' : 'offline',
                  custom_settings: JSON.parse(user.custom_settings) || {},
                  gifts: updatedGifts,
                };
              });


        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

              io.to(roomId).emit("roomUpdated", {encryptedData});

              console.log(`Room ${roomId} updated and broadcasted to all users.`);
            });
          });
        });
      });
    });
  });
});


socket.on("giftPremiumAdmin", ({ senderId, receiverId, months, roomId, price }) => {
  console.log(`Admin ${senderId} is gifting premium to user ${receiverId} for ${months} months.`);

  if (senderId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }
  const fetchUserQuery = "SELECT isAdmin FROM users WHERE userId = ?";
  db.query(fetchUserQuery, [senderId], (err, senderResults) => {
    if (err) {
      console.error("Error fetching sender data:", err);
      return;
    }

    if (senderResults.length === 0) {
      console.error(`Sender ${senderId} not found.`);
      return;
    }

    const sender = senderResults[0];
    const isAdmin = sender.isAdmin;

    if (!isAdmin) {
      console.error(`Sender ${senderId} is not an admin.`);
      return;
    }

    const fetchRecipientQuery = "SELECT * FROM users WHERE userId = ?";
    db.query(fetchRecipientQuery, [receiverId], (err, userResults) => {
      if (err) {
        console.error("Error fetching recipient data:", err);
        return;
      }

      if (userResults.length === 0) {
        console.error(`Recipient ${receiverId} not found.`);
        return;
      }

      const user = userResults[0];

    const currentPremiumDate = user.premium_expires_at 
  ? new Date(user.premium_expires_at) 
  : new Date();

const newPremiumDate = new Date(Date.UTC(
  currentPremiumDate.getUTCFullYear(),
  currentPremiumDate.getUTCMonth() + months,
  currentPremiumDate.getUTCDate(),
  currentPremiumDate.getUTCHours(),
  currentPremiumDate.getUTCMinutes(),
  currentPremiumDate.getUTCSeconds()
));

      const formattedDate = formatDateForMySQL(newPremiumDate);

      const updateUserQuery = `
        UPDATE users 
        SET is_premium = ?, premium_expires_at = ?
        WHERE userId = ?
      `;
      db.query(updateUserQuery, [true, formattedDate, receiverId], (updateErr) => {
        if (updateErr) {
          console.error("Error updating recipient premium status:", updateErr);
          return;
        }

        console.log(`Premium gifted successfully to user ${receiverId} by admin ${senderId}.`);


        const insertPaymentQuery = `
          INSERT INTO payments (giftName, senderId, receiverId, forStars , currentTime)
          VALUES (?, ?, ?, ? , UTC_TIMESTAMP())
        `;
        db.query(insertPaymentQuery, [`Premium ${months} months`, senderId, receiverId, 0 ], (paymentErr) => {
          if (paymentErr) {
            console.error("Error inserting payment record:", paymentErr);
            return;
          }

          console.log(`Payment record created for premium gift from admin ${senderId} to ${receiverId}.`);

          const fetchRoomQuery = "SELECT * FROM rooms WHERE roomId = ?";
          db.query(fetchRoomQuery, [roomId], (roomErr, roomResults) => {
            if (roomErr) {
              console.error("Error fetching room data:", roomErr);
              return;
            }

            const room = roomResults[0];
            const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
            const members = room?.members ? JSON.parse(room.members) : [];
            const videoSettings = room?.videoSettings ? JSON.parse(room.videoSettings) : [];
            const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

            const giftMessage = {
              id: chatRoom.length + 1,
              userId: 'admin',
              senderId: senderId,
              giftImg: 'premium',
              giftedTo: receiverId,
              text: `Gift Premium for ${months} month(s)`,
              nextText: "Receiver",
            };
            chatRoom.push(giftMessage);

            const updateRoomQuery = "UPDATE rooms SET chatRoom = ? WHERE roomId = ?";
            db.query(updateRoomQuery, [JSON.stringify(chatRoom), roomId], (chatUpdateErr) => {
              if (chatUpdateErr) {
                console.error("Error updating chat room data:", chatUpdateErr);
                return;
              }

              const userQuery = "SELECT id, userId, first_name, last_name, photo_url, created_at, is_premium, custom_settings, gifts ,exp FROM users WHERE userId IN (?)";
              db.query(userQuery, [historyMembers], (userErr, userResults) => {
                if (userErr) {
                  console.error("Error fetching users data:", userErr);
                  return;
                }

                const updatedUsers = userResults.map((user) => {
                  const isOnline = members.includes(user.userId);

                  const gifts = JSON.parse(user.gifts) || [];
                  const updatedGifts = gifts.map((gift) => {
                    const sender = userResults.find((u) => u.userId === gift.senderId);
                    return {
                      ...gift,
                      senderName: sender ? sender.first_name : 'Unknown',
                      senderPhoto: sender ? sender.photo_url : null,
                    };
                  });

                  return {
                    ...user,
                    status: isOnline ? 'online' : 'offline',
                    custom_settings: JSON.parse(user.custom_settings) || {},
                    gifts: updatedGifts,
                  };
                });


        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

                io.to(roomId).emit("roomUpdated", {encryptedData});

                console.log(`Room ${roomId} updated and broadcasted to all users.`);
              });
            });
          });
        });
      });
    });
  });
});


socket.on('sendGift', ({ senderId, receiverId, gift, roomId }) => {
  console.log(`User ${senderId} is sending a gift to user ${receiverId}: ${gift.name}`);

  if (senderId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }

  const fetchUserQuery = 'SELECT gifts, exp FROM users WHERE userId = ?';
  db.query(fetchUserQuery, [receiverId], (err, userResults) => {
    if (err) {
      console.error('Error fetching user data:', err);
      return;
    }

    if (userResults.length === 0) {
      console.error(`User ${receiverId} not found.`);
      return;
    }

    const currentGifts = userResults[0].gifts ? JSON.parse(userResults[0].gifts) : [];

    const newGift = {
      id: currentGifts.length + 1,
      name: gift.name,
      imgUrl: gift.imgUrl,
      senderId: senderId,
      price: gift.price,
      hidden: false,
    };

    currentGifts.push(newGift);

    const updateUserQuery = 'UPDATE users SET gifts = ? WHERE userId = ?';
    db.query(updateUserQuery, [JSON.stringify(currentGifts), receiverId], (updateErr) => {
      if (updateErr) {
        console.error('Error updating user gifts:', updateErr);
        return;
      }

      console.log(`Gift sent successfully from user ${senderId} to user ${receiverId}.`);

      const updateExpQuery = 'UPDATE users SET exp = exp + ? WHERE userId = ?';
      const giftExp = gift.gift_exp || 0; 

      db.query(updateExpQuery, [giftExp, senderId], (expUpdateErr) => {
        if (expUpdateErr) {
          console.error('Error updating sender exp:', expUpdateErr);
          return;
        }

        console.log(`User ${senderId} exp updated by ${giftExp}.`);
      });


      const insertPaymentQuery = `
        INSERT INTO payments (giftName, senderId, receiverId, forStars, forPoints , currentTime)
        VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
      `;
      const paymentData = [
        gift.name,
        senderId,
        receiverId,
        gift.price || null, 
        gift?.forPoints || null
      ];

      db.query(insertPaymentQuery, paymentData, (paymentErr) => {
        if (paymentErr) {
          console.error('Error saving payment data:', paymentErr);
          return;
        }

        console.log('Payment record saved successfully.');
      });

      const fetchRoomQuery = 'SELECT * FROM rooms WHERE roomId = ?';
      db.query(fetchRoomQuery, [roomId], (roomErr, roomResults) => {
        if (roomErr) {
          console.error('Error fetching room data:', roomErr);
          return;
        }

        const room = roomResults[0];
        const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
        const members = room?.members ? JSON.parse(room.members) : [];
        const videoSettings = room?.videoSettings ? JSON.parse(room.videoSettings) : [];
        const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

        const giftMessage = {
          id: chatRoom.length + 1,
          userId: 'admin',
          giftSenderId: senderId,
          giftedTo: receiverId,
          text: `Gift ${gift.name}`,
          giftImg: gift.imgUrl,
          giftPrice: gift.price,
          nextText: `Receiver`
        };
        chatRoom.push(giftMessage);

        const updateRoomQuery = 'UPDATE rooms SET chatRoom = ? WHERE roomId = ?';
        db.query(updateRoomQuery, [JSON.stringify(chatRoom), roomId], (chatUpdateErr) => {
          if (chatUpdateErr) {
            console.error('Error updating chatRoom data:', chatUpdateErr);
            return;
          }

          const userQuery = 'SELECT id, userId, first_name, last_name, photo_url, created_at, is_premium, custom_settings, gifts , exp FROM users WHERE userId IN (?)';
          db.query(userQuery, [historyMembers], (userErr, userResults) => {
            if (userErr) {
              console.error('Error fetching users data:', userErr);
              return;
            }

            const updatedUsers = userResults.map((user) => {
              const isOnline = members.includes(user.userId);
              const gifts = JSON.parse(user.gifts) || [];

              const updatedGifts = gifts.map((gift) => {
                const sender = userResults.find((u) => u.userId === gift.senderId);
                return {
                  ...gift,
                  senderName: sender ? sender.first_name : 'Unknown',
                  senderPhoto: sender ? sender.photo_url : null,
                };
              });

              return {
                ...user,
                status: isOnline ? 'online' : 'offline',
                custom_settings: JSON.parse(user.custom_settings) || {},
                gifts: updatedGifts,
              };
            });


        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

            io.to(roomId).emit('roomUpdated', {encryptedData});
            socket.emit('giftSent', { message: 'Подарок успешно отправлен.', gift: newGift });
            console.log(`Room ${roomId} updated and broadcasted to all users.`);
          });
        });
      });
    });
  });
});


socket.on('sendGiftAdmin', ({ senderId, receiverId, gift, roomId }) => {
  console.log(`Admin ${senderId} is sending a gift to user ${receiverId}: ${gift.name}`);

  if (senderId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }

  const fetchUserQuery = 'SELECT gifts, isAdmin FROM users WHERE userId = ?';
  db.query(fetchUserQuery, [senderId], (err, userResults) => {
    if (err) {
      console.error('Error fetching user data:', err);
      return;
    }

    if (userResults.length === 0) {
      console.error(`User ${senderId} not found.`);
      return;
    }

    const sender = userResults[0];
    
    if (sender.isAdmin !== 1) {
      console.log('Only admins can send gifts using this method.');
      return;
    }

    const fetchReceiverQuery = 'SELECT gifts FROM users WHERE userId = ?';
    db.query(fetchReceiverQuery, [receiverId], (err, receiverResults) => {
      if (err) {
        console.error('Error fetching receiver data:', err);
        return;
      }

      if (receiverResults.length === 0) {
        console.error(`Receiver ${receiverId} not found.`);
        return;
      }

      const currentGifts = receiverResults[0].gifts ? JSON.parse(receiverResults[0].gifts) : [];

      const newGift = {
        id: currentGifts.length + 1,
        name: gift.name,
        imgUrl: gift.imgUrl,
        senderId: senderId,
        price: gift.price,
        hidden: false,
      };

      currentGifts.push(newGift);

      const updateUserQuery = 'UPDATE users SET gifts = ? WHERE userId = ?';
      db.query(updateUserQuery, [JSON.stringify(currentGifts), receiverId], (updateErr) => {
        if (updateErr) {
          console.error('Error updating user gifts:', updateErr);
          return;
        }

        console.log(`Gift sent successfully from admin ${senderId} to user ${receiverId}.`);


        const insertPaymentQuery = `
          INSERT INTO payments (giftName, senderId, receiverId, forStars, forPoints , currentTime)
          VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
        `;
        const paymentData = [
          gift.name,
          senderId,
          receiverId,
          0, 
          0
        ];

        db.query(insertPaymentQuery, paymentData, (paymentErr) => {
          if (paymentErr) {
            console.error('Error saving payment data:', paymentErr);
            return;
          }

          console.log('Payment record saved successfully.');
        });

        const fetchRoomQuery = 'SELECT * FROM rooms WHERE roomId = ?';
        db.query(fetchRoomQuery, [roomId], (roomErr, roomResults) => {
          if (roomErr) {
            console.error('Error fetching room data:', roomErr);
            return;
          }

          const room = roomResults[0];
          const chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];
          const members = room?.members ? JSON.parse(room.members) : [];
          const videoSettings = room?.videoSettings ? JSON.parse(room.videoSettings) : [];
          const historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];

          const giftMessage = {
            id: chatRoom.length + 1,
            userId: 'admin',
            giftSenderId: senderId,
            giftedTo: receiverId,
            text: `Gift ${gift.name}`,
            giftImg: gift.imgUrl,
            giftPrice: gift.price,
            nextText: `Receiver`,
          };
          chatRoom.push(giftMessage);

          const updateRoomQuery = 'UPDATE rooms SET chatRoom = ? WHERE roomId = ?';
          db.query(updateRoomQuery, [JSON.stringify(chatRoom), roomId], (chatUpdateErr) => {
            if (chatUpdateErr) {
              console.error('Error updating chatRoom data:', chatUpdateErr);
              return;
            }

            const userQuery = 'SELECT id, userId, first_name, last_name, photo_url, created_at, is_premium, custom_settings, gifts , exp FROM users WHERE userId IN (?)';
            db.query(userQuery, [historyMembers], (userErr, userResults) => {
              if (userErr) {
                console.error('Error fetching users data:', userErr);
                return;
              }

              const updatedUsers = userResults.map((user) => {
                const isOnline = members.includes(user.userId);
                const gifts = JSON.parse(user.gifts) || [];

                const updatedGifts = gifts.map((gift) => {
                  const sender = userResults.find((u) => u.userId === gift.senderId);
                  return {
                    ...gift,
                    senderName: sender ? sender.first_name : 'Unknown',
                    senderPhoto: sender ? sender.photo_url : null,
                  };
                });

                return {
                  ...user,
                  status: isOnline ? 'online' : 'offline',
                  custom_settings: JSON.parse(user.custom_settings) || {},
                  gifts: updatedGifts,
                };
              });


        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom, 
          videoSettings
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

              io.to(roomId).emit('roomUpdated', {encryptedData});
              socket.emit('giftSentAdmin', { message: 'Подарок успешно отправлен администратором.', gift: newGift });
              console.log(`Room ${roomId} updated and broadcasted to all users.`);
            });
          });
        });
      });
    });
  });
});


  socket.on('send_emoji', ({ emoji, roomId, sender }) => {
    io.to(roomId).emit('receive_emoji', { emoji, sender });
  });

 socket.on('leaveRoom', ({ roomId, userId }) => {
    console.log(`Пользователь ${userId} покидает комнату ${roomId}`);

  if (userId !== socket.user.userId) {
    console.error('Unauthorized user trying to join the room',socket.user.userId);
    return;
  }

    const query = 'SELECT * FROM rooms WHERE roomId = ?';
    db.query(query, [roomId], (err, results) => {
      if (err) {
        console.error('Ошибка при получении данных комнаты:', err);
        return;
      }

      const room = results[0];
      let members = room?.members ? JSON.parse(room.members) : [];
      let historyMembers = room?.historyMembers ? JSON.parse(room.historyMembers) : [];
      let chatRoom = room?.chatRoom ? JSON.parse(room.chatRoom) : [];

      members = members.filter((member) => member !== userId);

      const leaveMessage = {
        id: chatRoom.length + 1,
        userId: 'admin', 
        leftId: userId,
        text: `Left the room`
      };
      chatRoom.push(leaveMessage); 

      const updateQuery = `
        UPDATE rooms SET 
        members = ?, 
        chatRoom = ? 
        WHERE roomId = ?
      `;
      db.query(updateQuery, [
        JSON.stringify(members),
        JSON.stringify(chatRoom),
        roomId
      ], (updateErr) => {
        if (updateErr) {
          console.error('Ошибка при обновлении данных комнаты:', updateErr);
          return;
        }

        const userQuery = 'SELECT id,userId,first_name,last_name,photo_url,created_at,is_premium,custom_settings,gifts,exp FROM users WHERE userId IN (?)';
        db.query(userQuery, [historyMembers], (userErr, userResults) => {
          if (userErr) {
            console.error('Ошибка при получении данных пользователей:', userErr);
            return;
          }

const updatedUsers = userResults.map((user) => {
  const isOnline = members.includes(user.userId);
  
  const gifts = JSON.parse(user.gifts) || [];
  
  const updatedGifts = gifts.map((gift) => {

    const sender = userResults.find((u) => u.userId === gift.senderId);
    return {
      ...gift,
      senderName: sender ? sender.first_name : 'Unknown', 
      senderPhoto: sender ? sender.photo_url : null,      
    };
  });

  return {
    ...user,
    status: isOnline ? 'online' : 'offline',
    custom_settings: JSON.parse(user.custom_settings) || {},
    gifts: updatedGifts, 
  };
});


        const roomData = {
          ...room,
          members,  
          users: updatedUsers, 
          chatRoom
        }

        const encryptedData = encryptData(roomData, process.env.SECRET_KEY_CODE);

          io.to(roomId).emit('roomUpdated', {
              encryptedData
          });

          socket.emit('roomUpdated', {
            encryptedData
          });
        });
      });
    });

    socket.leave(roomId);
  });


  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

  }