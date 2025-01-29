import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const App = () => {
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSignup, setShowSignup] = useState(false); // Toggle between login and signup forms
  const [products, setProducts] = useState([
    { id: 'BTC-USD', subscribed: false },
    { id: 'ETH-USD', subscribed: false },
    { id: 'XRP-USD', subscribed: false },
    { id: 'LTC-USD', subscribed: false },
  ]);
  const [level2Data, setLevel2Data] = useState({});
  const [matchData, setMatchData] = useState([]);
  const [systemStatus, setSystemStatus] = useState([]);
  const [socket, setSocket] = useState(null);

  // Login function
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/login', {
        username,
        password,
      });
      setToken(response.data.token); // Store token
      setIsLoggedIn(true);
      setLoginError('');
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Invalid credentials. Please try again.');
    }
  };

  // Signup function
  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:5000/signup', {
        username,
        password,
        email,
      });
      setSignupSuccess('Signup successful! Please log in.');
      setSignupError('');
      setShowSignup(false); // Switch back to login form
    } catch (error) {
      console.error('Signup error:', error);
      setSignupError('Signup failed. Please try again.');
    }
  };

  // Toggle subscription
  const toggleSubscription = (product_id) => {
    const product = products.find((p) => p.id === product_id);
    if (product.subscribed) {
      socket.emit('unsubscribe', { product_id });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product_id ? { ...p, subscribed: false } : p
        )
      );
      setLevel2Data((prev) => {
        const updatedData = { ...prev };
        delete updatedData[product_id]; // Remove the product data
        return updatedData;
      });
      setMatchData((prev) => prev.filter((match) => match.product_id !== product_id)); // Remove match data
    } else {
      socket.emit('subscribe', { product_id });
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product_id ? { ...p, subscribed: true } : p
        )
      );
    }
  };

  // Socket initialization and event listeners
  useEffect(() => {
    if (!token) return; // Ensure the token is available

    // Initialize socket after token is set
    const newSocket = io('http://localhost:5000', {
      auth: { token }, // Attach JWT for authentication
    });
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('data', (data) => {
      setLevel2Data((prev) => ({
        ...prev,
        [data.product_id]: {
          price: data.price,
          size: data.size,
          time: data.time,
          product_id: data.product_id,
        },
      }));
      setMatchData((prev) => [
        { ...data, color: data.side === 'buy' ? 'green' : 'red' },
        ...prev.slice(0, 9),
      ]);
    });

    newSocket.on('system_status', (status) => {
      setSystemStatus((prev) => [status, ...prev.slice(0, 9)]);
    });

    newSocket.on('subscribed', (product_id) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product_id ? { ...p, subscribed: true } : p
        )
      );
    });

    newSocket.on('unsubscribed', (product_id) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product_id ? { ...p, subscribed: false } : p
        )
      );
      setLevel2Data((prev) => {
        const updatedData = { ...prev };
        delete updatedData[product_id]; // Remove the product data
        return updatedData;
      });
      setMatchData((prev) => prev.filter((match) => match.product_id !== product_id)); // Remove match data
    });

    // Cleanup socket on component unmount or token change
    return () => {
      newSocket.off('data');
      newSocket.off('system_status');
      newSocket.off('subscribed');
      newSocket.off('unsubscribed');
      newSocket.close(); // Close the socket connection
    };
  }, [token]); // Run effect when token changes

  if (!isLoggedIn) {
    return (
      <div>
        <h1>{showSignup ? 'Signup' : 'Login'}</h1>
        {showSignup ? (
          <form onSubmit={handleSignup}>
            <div>
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button type="submit">Signup</button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div>
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit">Login</button>
          </form>
        )}
        {loginError && <p style={{ color: 'red' }}>{loginError}</p>}
        {signupError && <p style={{ color: 'red' }}>{signupError}</p>}
        {signupSuccess && <p style={{ color: 'green' }}>{signupSuccess}</p>}
        <button onClick={() => setShowSignup(!showSignup)}>
          {showSignup ? 'Go to Login' : 'Go to Signup'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Coinbase Pro WebSocket App</h1>
      <section>
        <h2>Subscribe/Unsubscribe</h2>
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => toggleSubscription(product.id)}
            style={{
              backgroundColor: product.subscribed ? 'red' : 'green',
              color: 'white',
              margin: '5px',
            }}
          >
            {product.subscribed
              ? `Unsubscribe ${product.id}`
              : `Subscribe ${product.id}`}
          </button>
        ))}
      </section>

      <section>
        <h2>Price View</h2>
        <ul>
          {Object.keys(level2Data).map((productId) => (
            <li key={productId}>
              <strong>{productId}</strong>
              <ul>
                <li><strong>Price:</strong> {level2Data[productId].price}</li>
                <li><strong>Size:</strong> {level2Data[productId].size}</li>
                <li><strong>Time:</strong> {level2Data[productId].time}</li>
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Match View</h2>
        <ul>
          {matchData.map((match, index) => (
            <li key={index} style={{ color: match.color }}>
              {match.time} - {match.product_id} - {match.size} @ {match.price}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>System Status</h2>
        <ul>
          {systemStatus.map((status, index) => (
            <li key={index}>{status}</li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default App;
