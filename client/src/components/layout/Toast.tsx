interface Props {
  message: string | null;
}

export default function Toast({ message }: Props) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-700 px-4 py-2 rounded-lg shadow-lg text-sm animate-bounce">
      {message}
    </div>
  );
}
