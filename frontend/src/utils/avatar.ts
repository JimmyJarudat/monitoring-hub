export const getAvatarUrl = (username: string) =>
  `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(username)}&backgroundColor=ffd5dc,ffb6c1,e8c4f0&backgroundType=gradientLinear`;
