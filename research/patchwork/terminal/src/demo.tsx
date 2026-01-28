import { render } from 'ink';
import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useApp } from 'ink';

function DemoWidget() {
  const { exit } = useApp();
  const [count, setCount] = useState(0);
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit();
    if (input === '+' || input === '=') setCount((c) => c + 1);
    if (input === '-') setCount((c) => c - 1);
    if (input === 'r') setCount(0);
  });

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor="cyan"
    >
      <Text
        bold
        color="cyan"
      >
        Patchwork Terminal Widget Demo
      </Text>
      <Box marginTop={1}>
        <Text>Time: </Text>
        <Text color="yellow">{time}</Text>
      </Box>
      <Box>
        <Text>Count: </Text>
        <Text color="green">{count}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press +/- to change count, r to reset, q to quit</Text>
      </Box>
    </Box>
  );
}

console.log('\nStarting Patchwork Terminal Demo...\n');
const instance = render(React.createElement(DemoWidget));

instance.waitUntilExit().then(() => {
  console.log('\nDemo exited. Goodbye!\n');
});
