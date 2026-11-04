export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#111]">
      <div className="max-w-4xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="calm-skeleton h-6 w-28 rounded-full" />
          <div className="flex gap-2">
            <div className="calm-skeleton h-7 w-20 rounded-full" />
            <div className="calm-skeleton h-7 w-24 rounded-full" />
          </div>
        </div>
        <div className="pt-14 text-center">
          <div className="calm-skeleton mx-auto h-3 w-40 rounded-full" />
          <div className="calm-skeleton mx-auto mt-5 h-14 w-2/3 rounded-[18px]" />
          <div className="calm-skeleton mx-auto mt-8 h-12 max-w-xl rounded-full" />
        </div>
        <div className="mt-12 grid gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="calm-skeleton h-28 rounded-[22px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
