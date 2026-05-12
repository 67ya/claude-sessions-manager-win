interface Props {
  search: string;
  onSearch: (v: string) => void;
  categories: string[];
  catFilter: string;
  onCatFilter: (v: string) => void;
  archivedFilter: string;
  onArchivedFilter: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  providerFilter: string;
  onProviderFilter: (v: string) => void;
}

export default function SearchBar({
  search,
  onSearch,
  categories,
  catFilter,
  onCatFilter,
  archivedFilter,
  onArchivedFilter,
  sort,
  onSort,
  providerFilter,
  onProviderFilter,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-1 flex-wrap">
      <input
        type="text"
        placeholder="Search sessions..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="flex-1 min-w-[120px] max-w-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />
      <select
        value={catFilter}
        onChange={(e) => onCatFilter(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={archivedFilter}
        onChange={(e) => onArchivedFilter(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
      >
        <option value="">Active</option>
        <option value="true">All</option>
        <option value="only">Archived only</option>
      </select>
      <select
        value={providerFilter}
        onChange={(e) => onProviderFilter(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
      >
        <option value="">All providers</option>
        <option value="api">API</option>
        <option value="subscription">Subscription</option>
        <option value="mixed">Mixed</option>
        <option value="unknown">Unknown</option>
      </select>
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500"
      >
        <option value="">Last Activity</option>
        <option value="messages-desc">Messages ↓</option>
        <option value="messages-asc">Messages ↑</option>
        <option value="size-desc">Size ↓</option>
        <option value="size-asc">Size ↑</option>
        <option value="created-desc">Created ↓</option>
        <option value="created-asc">Created ↑</option>
      </select>
    </div>
  );
}
