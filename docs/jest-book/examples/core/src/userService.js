import { getUser } from './api';
export async function displayName(id) {
  const user = await getUser(id);
  return user ? `${user.first} ${user.last}` : 'Unknown user';
}
