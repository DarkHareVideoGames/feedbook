import { getRoomBaseName } from '../../helpers/roomName';

type Props = { name: string; accent: string };

export default function RoomName({ name, accent }: Props) {
  return <span style={{ color: accent }}>{getRoomBaseName(name)}</span>;
}