import { DownOutlined, PlusOutlined, UpOutlined } from "@ant-design/icons";
import { Button, Select, Skeleton } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  capacityOptions,
  colorOptions,
  familyOptions,
  productsInCategory,
} from "@/domain/catalog";
import {
  CATEGORY_OPTIONS,
  productUrl,
  REGIONS,
  targetKey,
  type CatalogPayload,
  type Category,
  type Product,
  type Store,
  type Target,
  type TargetState,
} from "@/domain/types";

interface Props {
  locale: string;
  catalog: CatalogPayload | null;
  loading: boolean;
  rows: TargetState[];
  onLocaleChange(locale: string): void;
  onAdd(target: Target): void;
  onAddMany(targets: Target[]): void;
}

const searchable = { optionFilterProp: "label" } as const;

function buildTarget(locale: string, store: Store, product: Product): Target {
  return {
    locale,
    storeNumber: store.number,
    storeTitle: store.title,
    partNumber: product.partNumber,
    productName: product.title,
    productUrl: productUrl(locale, product.partNumber),
  };
}

export function TargetBuilder({ locale, catalog, loading, rows, onLocaleChange, onAdd, onAddMany }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [category, setCategory] = useState<Category>("iphone");
  const [storeNumber, setStoreNumber] = useState<string>();
  const [partNumber, setPartNumber] = useState<string>();
  const [family, setFamily] = useState<string>();
  const [capacity, setCapacity] = useState<string>();
  const [color, setColor] = useState<string>();

  useEffect(() => {
    setStoreNumber(undefined);
    setPartNumber(undefined);
    setFamily(undefined);
    setCapacity(undefined);
    setColor(undefined);
  }, [locale]);

  const activeCatalog = catalog?.locale === locale ? catalog : null;
  const products = activeCatalog?.products ?? [];
  const productOptions = useMemo(
    () => productsInCategory(products, category).map((item) => ({ value: item.partNumber, label: item.title })),
    [category, products],
  );
  const families = useMemo(() => familyOptions(products, category), [category, products]);
  const capacities = useMemo(
    () => capacityOptions(products, category, family ?? ""),
    [category, family, products],
  );
  const colors = useMemo(
    () => colorOptions(products, category, family ?? "", capacity ?? ""),
    [capacity, category, family, products],
  );
  const stores = useMemo(
    () => (activeCatalog?.stores ?? []).map((item) => ({ value: item.number, label: item.title })),
    [activeCatalog?.stores],
  );

  const selectedProduct: Product | undefined = products.find((item) =>
    category === "iphone"
      ? item.category === category && item.family === family && item.capacity === capacity && item.color === color
      : item.partNumber === partNumber,
  );
  const selectedStore = activeCatalog?.stores.find((item) => item.number === storeNumber);
  const target = selectedProduct && selectedStore ? buildTarget(locale, selectedStore, selectedProduct) : null;
  const existingKeys = new Set(rows.map((row) => targetKey(row.target)));
  const duplicate = target ? existingKeys.has(targetKey(target)) : false;
  const allColorTargets = selectedStore && category === "iphone" && family && capacity
    ? products
        .filter((product) =>
          product.category === category &&
          product.family === family &&
          product.capacity === capacity &&
          product.color !== ""
        )
        .filter((product, index, items) => items.findIndex((candidate) => candidate.color === product.color) === index)
        .map((product) => buildTarget(locale, selectedStore, product))
    : [];
  const newColorTargets = allColorTargets.filter((item) => !existingKeys.has(targetKey(item)));
  const storeGroups = new Set(rows.map((row) => `${row.target.locale}|${row.target.storeNumber}`));
  const selectedStoreKey = selectedStore ? `${locale}|${selectedStore.number}` : null;
  const wouldExceedStores = Boolean(selectedStoreKey && !storeGroups.has(selectedStoreKey) && storeGroups.size >= 6);
  const wouldExceedTargetLimit = rows.length + newColorTargets.length > 24;

  const resetProduct = () => {
    setPartNumber(undefined);
    setFamily(undefined);
    setCapacity(undefined);
    setColor(undefined);
  };

  const add = () => {
    if (!target || duplicate || wouldExceedStores || rows.length >= 24) return;
    onAdd(target);
    resetProduct();
  };

  const addAllColors = () => {
    if (!newColorTargets.length || wouldExceedStores || wouldExceedTargetLimit) return;
    onAddMany(newColorTargets);
    resetProduct();
  };

  return (
    <section className={`panel target-builder${expanded ? "" : " is-collapsed"}`}>
      <div className="section-heading target-builder-heading">
        <div><span className="eyebrow">STEP 01</span><h2>添加监控目标</h2></div>
        <div className="target-builder-heading-actions">
          <span className="section-note">最多 24 项 / 6 家门店</span>
          <Button
            type="text"
            size="small"
            icon={expanded ? <UpOutlined /> : <DownOutlined />}
            aria-expanded={expanded}
            aria-controls="target-builder-content"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起" : "展开"}
          </Button>
        </div>
      </div>
      <div id="target-builder-content" hidden={!expanded}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <div className="builder-grid">
          <label className="field"><span>地区</span>
            <Select
              value={locale}
              options={REGIONS.map((item) => ({ value: item.locale, label: item.title }))}
              showSearch={searchable}
              onChange={onLocaleChange}
            />
          </label>
          <label className="field"><span>品类</span>
            <Select
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={(value) => { setCategory(value); resetProduct(); }}
            />
          </label>
          <label className="field field-wide"><span>门店</span>
            <Select
              value={storeNumber}
              options={stores}
              placeholder="搜索并选择门店"
              showSearch={searchable}
              onChange={setStoreNumber}
            />
          </label>
          {category === "iphone" ? (
            <>
              <label className="field field-wide"><span>机型</span>
                <Select
                  value={family}
                  options={families}
                  placeholder="选择机型"
                  showSearch={searchable}
                  onChange={(value) => { setFamily(value); setCapacity(undefined); setColor(undefined); }}
                />
              </label>
              <label className="field"><span>容量</span>
                <Select
                  value={capacity}
                  options={capacities}
                  disabled={!family}
                  placeholder="选择容量"
                  onChange={(value) => { setCapacity(value); setColor(undefined); }}
                />
              </label>
              <label className="field"><span>颜色</span>
                <Select
                  value={color}
                  options={colors}
                  disabled={!capacity}
                  placeholder="选择颜色"
                  showSearch={searchable}
                  onChange={setColor}
                />
              </label>
            </>
          ) : (
            <label className="field field-model"><span>型号</span>
              <Select
                value={partNumber}
                options={productOptions}
                placeholder="搜索并选择型号"
                showSearch={searchable}
                onChange={setPartNumber}
              />
            </label>
          )}
          {category === "iphone" ? (
            <div className="target-builder-actions">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!target || duplicate || wouldExceedStores || rows.length >= 24}
                onClick={add}
              >
                {duplicate ? "已添加" : wouldExceedStores ? "门店已达上限" : "添加目标"}
              </Button>
              <Button
                icon={<PlusOutlined />}
                disabled={!selectedStore || !family || !capacity || !newColorTargets.length || wouldExceedStores || wouldExceedTargetLimit}
                onClick={addAllColors}
              >
                {wouldExceedStores
                  ? "门店已达上限"
                  : wouldExceedTargetLimit
                    ? "超出目标上限"
                    : allColorTargets.length > 0 && newColorTargets.length === 0
                      ? "颜色均已添加"
                      : `添加全部颜色${newColorTargets.length ? `（${newColorTargets.length}）` : ""}`}
              </Button>
            </div>
          ) : (
            <Button
              className="add-target-button"
              type="primary"
              icon={<PlusOutlined />}
              disabled={!target || duplicate || wouldExceedStores || rows.length >= 24}
              onClick={add}
            >
              {duplicate ? "已添加" : wouldExceedStores ? "门店已达上限" : "添加目标"}
            </Button>
          )}
          </div>
        )}
      </div>
    </section>
  );
}
