const jwt = require('jsonwebtoken');



const authenticateJWT = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).send('Unauthorized');
  }

  jwt.verify(token, process.env.SECRET_KEY_JWT, (err, user) => {
    if (err) {
      return res.status(403).send('Forbidden');
    }

    req.user = user;  
    next();
  });
};

const authenticateSocketJWT = (socket, next) => {
  const token = socket.handshake.query.token; 

  if (!token) {
    return next(new Error('Unauthorized'));
  }

  jwt.verify(token, process.env.SECRET_KEY_JWT, (err, user) => {
    if (err) {
      return next(new Error('Forbidden'));
    }
    socket.user = user; 
    next(); 
  });
};

module.exports = { authenticateJWT , authenticateSocketJWT};